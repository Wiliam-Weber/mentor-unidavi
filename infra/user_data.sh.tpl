#!/bin/bash
# Boot das instâncias da aplicação (Amazon Linux 2023)
set -euo pipefail
exec > >(tee /var/log/mentor-boot.log) 2>&1

dnf update -y --security
dnf install -y docker
systemctl enable --now docker
umask 077

# 1. Segredos (Secrets Manager, criptografados com KMS). Nada fica na imagem nem no código.
#    - segredo da aplicação: JWT_SECRET e APP_DB_PASSWORD (gravados pelo pipeline)
#    - segredo do administrador do banco: gerado e guardado pelo próprio RDS
for tentativa in $(seq 1 60); do
  if aws secretsmanager get-secret-value --region ${region} --secret-id ${secret_id} \
       --query SecretString --output text > /root/app.json 2>/dev/null \
     && python3 -c 'import json,sys; d=json.load(open("/root/app.json")); sys.exit(0 if d.get("JWT_SECRET") and d.get("APP_DB_PASSWORD") else 1)'; then
    break
  fi
  echo "Aguardando segredo ${secret_id} (tentativa $tentativa)"
  sleep 10
done
aws secretsmanager get-secret-value --region ${region} --secret-id '${db_secret_arn}' \
  --query SecretString --output text > /root/db.json

# 2. Monta as conexões com o banco privado (senhas codificadas para URL)
python3 - <<'PY'
import json
from urllib.parse import quote
app = json.load(open('/root/app.json'))
adm = json.load(open('/root/db.json'))
host, banco = '${db_host}', '${db_name}'
url_app = f"postgresql://mentor_app:{quote(app['APP_DB_PASSWORD'], safe='')}@{host}:5432/{banco}"
url_adm = f"postgresql://{quote(adm['username'], safe='')}:{quote(adm['password'], safe='')}@{host}:5432/{banco}"
comum = {'DB_SSL_CA_FILE': '/app/rds-ca.pem'}
with open('/etc/mentor.env', 'w') as f:
    for k, v in {**comum, 'DATABASE_URL': url_app, 'JWT_SECRET': app['JWT_SECRET']}.items():
        f.write(f"{k}={v}\n")
with open('/etc/mentor-admin.env', 'w') as f:
    extra = {'SEED_DEMO': app.get('SEED_DEMO', '0'), 'SEED_PASSWORD': app.get('SEED_PASSWORD', '')}
    for k, v in {**comum, 'DATABASE_URL': url_app, 'DATABASE_URL_ADMIN': url_adm, 'SYNC_APP_PASSWORD': '1', **extra}.items():
        f.write(f"{k}={v}\n")
PY
shred -u /root/app.json /root/db.json

cat >> /etc/mentor.env <<CONF
NODE_ENV=production
PORT=8080
TRUST_PROXY=1
COOKIE_SECURE=${cookie_secure}
ALLOWED_ORIGINS=${origin}
CONF

# 3. Imagem do ECR privado (login com a credencial temporária da instância)
for tentativa in $(seq 1 30); do
  aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry} \
    && docker pull ${image} && break
  echo "Imagem ${image} ainda não disponível (tentativa $tentativa)"
  sleep 20
done

# 4. Migrações com o usuário administrador (container temporário). Um lock no banco
#    garante que só uma instância migra por vez. A credencial de admin é apagada em seguida.
for tentativa in $(seq 1 30); do
  docker run --rm --env-file /etc/mentor-admin.env -e NODE_ENV=production ${image} node scripts/migrate.js && break
  echo "Banco ainda não disponível (tentativa $tentativa)"
  sleep 20
done
if grep -q '^SEED_DEMO=1$' /etc/mentor-admin.env; then
  docker run --rm --env-file /etc/mentor-admin.env -e NODE_ENV=demo ${image} node scripts/seed-demo.js || true
fi
shred -u /etc/mentor-admin.env

# 5. Aplicação: container endurecido, conectando com o usuário de menor privilégio (mentor_app)
docker run -d --name mentor --restart always -p 8080:8080 \
  --env-file /etc/mentor.env \
  --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --pids-limit 200 \
  --log-driver awslogs \
  --log-opt awslogs-region=${region} \
  --log-opt awslogs-group=${log_group} \
  --log-opt awslogs-stream="$(hostname)" \
  ${image}
