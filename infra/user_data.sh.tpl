#!/bin/bash
# Boot das instâncias da aplicação (Amazon Linux 2023)
set -euo pipefail
exec > >(tee /var/log/mentor-boot.log) 2>&1

dnf update -y --security
dnf install -y docker
systemctl enable --now docker

# Espera o segredo ter valor (no primeiro deploy o pipeline grava logo após criar)
umask 077
for tentativa in $(seq 1 60); do
  if aws secretsmanager get-secret-value --region ${region} --secret-id ${secret_id} \
       --query SecretString --output text > /root/segredo.json 2>/dev/null \
     && python3 -c 'import json,sys; d=json.load(open("/root/segredo.json")); sys.exit(0 if d.get("DATABASE_URL") and d.get("JWT_SECRET") else 1)'; then
    break
  fi
  echo "Aguardando segredo ${secret_id} (tentativa $tentativa)"
  sleep 10
done

# Segredos vêm do Secrets Manager em tempo de boot (nunca ficam na imagem nem no código)
python3 -c 'import json; d=json.load(open("/root/segredo.json")); print("\n".join(f"{k}={v}" for k, v in d.items()))' > /etc/mentor.env
shred -u /root/segredo.json

cat >> /etc/mentor.env <<CONF
NODE_ENV=production
PORT=8080
TRUST_PROXY=1
COOKIE_SECURE=${cookie_secure}
ALLOWED_ORIGINS=${origin}
CONF

# Login no ECR privado com a credencial temporária da instância (sem senha armazenada)
for tentativa in $(seq 1 30); do
  aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry} \
    && docker pull ${image} && break
  echo "Imagem ${image} ainda não disponível (tentativa $tentativa)"
  sleep 20
done

# Container endurecido: sistema de arquivos somente leitura, sem capabilities, sem escalonamento de privilégio
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
