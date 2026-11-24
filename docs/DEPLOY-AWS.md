# Deploy na AWS – passo a passo

Guia para quem vai publicar o Mentor UNIDAVI no **AWS Academy (Learner Lab)**.
Ninguém precisa instalar nada no computador: **o GitHub Actions faz tudo** (scans de segurança,
migração do banco, Terraform e deploy). Você só configura os secrets e clica em *Run workflow*.

Tempo estimado: **20 minutos** na primeira vez (a maior parte é a AWS criando os recursos).

---

## 0. Fazer o fork

Quem não é dono do repositório não consegue cadastrar secrets nele. Por isso, faça uma cópia na sua conta:

1. Abra [github.com/Wiliam-Weber/mentor-unidavi](https://github.com/Wiliam-Weber/mentor-unidavi) → **Fork** → **Create fork**.
2. No seu fork, abra a aba **Actions** → **I understand my workflows, go ahead and enable them**.

Todos os passos abaixo são feitos **no seu fork**.

## 1. Iniciar o laboratório

1. Entre no AWS Academy → curso → **Modules → Learner Lab**.
2. Clique em **Start Lab** e espere a bolinha ficar **verde**.
3. Clique em **AWS Details** → **AWS CLI: Show**. Aparecem três valores:
   `aws_access_key_id`, `aws_secret_access_key` e `aws_session_token`.

> As credenciais **expiram quando a sessão do lab termina** (cerca de 4 horas).
> Em uma nova sessão, repita este passo e atualize os 3 secrets da AWS (passo 3).

## 2. Banco de dados (Supabase)

Peça ao dono do projeto, ou pegue em **Supabase → botão Connect → Session pooler**:

| Valor | Formato |
|-------|---------|
| `DATABASE_URL_ADMIN` | `postgresql://postgres.<ref>:<senha-do-banco>@aws-0-<regiao>.pooler.supabase.com:5432/postgres` |
| `DATABASE_URL` | `postgresql://mentor_app.<ref>:<senha-forte>@aws-0-<regiao>.pooler.supabase.com:6543/postgres` |

- A senha do `DATABASE_URL` pode ser **qualquer senha forte (16+ caracteres) inventada por você**:
  o pipeline configura essa senha no banco sozinho.
- Prefira senhas só com letras e números. Se tiver `@ # / : %`, troque na URL por `%40 %23 %2F %3A %25`.
- Repare na porta: **5432** no admin e **6543** na aplicação.

## 3. Configurar os secrets no GitHub

No repositório: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valor | Obrigatório |
|--------|-------|:-----------:|
| `AWS_ACCESS_KEY_ID` | do passo 1 | sim |
| `AWS_SECRET_ACCESS_KEY` | do passo 1 | sim |
| `AWS_SESSION_TOKEN` | do passo 1 | sim |
| `DATABASE_URL_ADMIN` | do passo 2 | sim |
| `DATABASE_URL` | do passo 2 | sim |
| `JWT_SECRET` | um texto aleatório de 48+ caracteres (veja abaixo) | sim |
| `SONAR_TOKEN` | token do SonarCloud (passo 5) | recomendado |
| `DB_SSL_CA_BASE64` | certificado do Supabase em base64 (valida o TLS do banco) | opcional |
| `SEED_PASSWORD` | senha dos usuários de demonstração (padrão: `Demo#Mentor2026`) | opcional |

Para gerar o `JWT_SECRET`, em qualquer terminal com Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## 4. Aprovação manual (opcional, mas vale mostrar)

**Settings → Environments → New environment** → nome `production` →
marque **Required reviewers** e adicione você. Assim o pipeline para e espera um clique de
aprovação antes de mexer no banco e na AWS.

## 5. SonarCloud (scanner exigido na atividade)

1. Entre em [sonarcloud.io](https://sonarcloud.io) com a conta do GitHub (gratuito para repositório público).
2. **+ → Analyze new project** → escolha o repositório `mentor-unidavi` → **Set up**.
3. Em **Administration → Analysis Method**, desligue a **Automatic Analysis** (a análise vem do pipeline).
4. Em **My Account → Security**, gere um token e crie o secret `SONAR_TOKEN` no GitHub.

A organização e a chave do projeto são deduzidas do nome do repositório (`dono_repositorio`, o padrão
do SonarCloud). Só se o SonarCloud mostrar valores diferentes, crie as **variables** `SONAR_ORGANIZATION`
e `SONAR_PROJECT_KEY` em *Settings → Secrets and variables → Actions → Variables*.

Sem o `SONAR_TOKEN`, o pipeline continua com Semgrep, Gitleaks, Checkov e Trivy e mostra um aviso.

## 6. Rodar o deploy

1. Aba **Actions → CI/CD Mentor UNIDAVI → Run workflow**.
2. Na primeira vez, marque **Criar/atualizar os dados de demonstração**.
3. Clique em **Run workflow** e acompanhe:

```
testes → análise estática → imagem → banco (aprovação) → deploy
```

4. No fim do job **Deploy na AWS**, o resumo mostra a **URL da aplicação** (`http://mentor-alb-....elb.amazonaws.com`).
   As instâncias levam **3 a 5 minutos** para ficar saudáveis. Antes disso a URL responde `502/503`.

Todo `push` na branch `main` roda o mesmo fluxo e atualiza a aplicação sem derrubá-la (instance refresh).

Enquanto os secrets do banco e da AWS não estiverem configurados, o pipeline roda testes e scans
normalmente e **pula o deploy** com um aviso (não fica vermelho).

## 7. Usuários para testar

Senha de todos: `Demo#Mentor2026` (ou o `SEED_PASSWORD`, se definido).

| Perfil | E-mail |
|--------|--------|
| Aluno | `aluno@demo.unidavi.edu.br` |
| Aluno com parcela vencida | `ana@demo.unidavi.edu.br` |
| Professor | `professor@demo.unidavi.edu.br` |
| Secretaria | `secretaria@demo.unidavi.edu.br` |

## 8. Depois da apresentação

**Actions → Destruir ambiente AWS → Run workflow** → digite `DESTRUIR`.
Remove toda a infraestrutura para não consumir o crédito do lab. O banco no Supabase continua.

---

## O que o Terraform cria

| Recurso | Para quê |
|---------|----------|
| VPC `10.0.0.0/16`, 2 zonas | rede isolada |
| 2 subnets públicas | só o Load Balancer e o NAT Gateway |
| 2 subnets privadas | instâncias da aplicação, sem IP público |
| Internet Gateway, NAT Gateway, rotas | entrada pelo ALB, saída controlada |
| NACLs | segunda barreira; bloqueiam 22 (SSH) e 3389 (RDP) da internet |
| Security Groups encadeados | Internet → ALB (80/443) → App (8080, só do ALB) |
| Application Load Balancer | distribui o tráfego entre as zonas e faz health check |
| AWS WAF | regras OWASP, SQL Injection, IPs maliciosos e limite por IP |
| Auto Scaling Group (2 a 4 × t3.small) | escala por CPU (60%) |
| ECR | registro privado das imagens, com scan e tags imutáveis |
| KMS (chave própria) | criptografa segredo, imagens e logs |
| Secrets Manager | credenciais do banco e JWT, lidas no boot da instância |
| CloudWatch | logs da aplicação e do WAF, alarme de erros 5xx |
| S3 de logs | Flow Logs da VPC e access logs do ALB |
| S3 do state | estado do Terraform (criado automaticamente pelo pipeline) |

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `ExpiredToken` / `InvalidClientTokenId` | sessão do lab expirou | passo 1 e atualizar os 3 secrets da AWS |
| `password authentication failed for user "postgres"` | senha errada no `DATABASE_URL_ADMIN` | resetar em Supabase → Database → Settings |
| Erro ao criar `aws_wafv2_web_acl` (AccessDenied) | conta do lab sem permissão de WAF | em **Settings → Secrets and variables → Actions → Variables**, criar `HABILITAR_WAF` = `false` e rodar de novo |
| Erro na chave KMS citando `LabRole` | a role do lab tem outro nome | em IAM → Roles, ache a role do `LabInstanceProfile` e crie a variável `LAB_ROLE_NAME` com esse nome |
| URL responde 502/503 por mais de 10 min | instâncias não subiram | EC2 → Instâncias → Actions → Monitor → **Get system log**: procure `Aguardando segredo` ou `Imagem ... ainda não disponível` |
| Pipeline parou em "Waiting for review" | aprovação manual (passo 4) | clicar em **Review deployments → Approve** |
