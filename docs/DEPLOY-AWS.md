# Deploy na AWS – passo a passo

Guia para quem vai publicar o Mentor UNIDAVI no **AWS Academy (Learner Lab)**.
Ninguém precisa instalar nada no computador: **o GitHub Actions faz tudo** (scans de segurança,
Terraform, banco e deploy). Você só cadastra **3 secrets da AWS** e clica em *Run workflow*.

O banco é um **Amazon RDS PostgreSQL** criado pelo próprio Terraform numa subnet privada, sem acesso
pela internet. As senhas do banco e o `JWT_SECRET` são **gerados automaticamente** e guardados no
AWS Secrets Manager: ninguém precisa criá-los nem conhecê-los.

Tempo estimado: **25 a 35 minutos** na primeira vez (a maior parte é a AWS criando NAT, RDS e instâncias).

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
> Em uma nova sessão, repita este passo e atualize os 3 secrets (passo 2).

## 2. Cadastrar os secrets no GitHub

No fork: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valor | Obrigatório |
|--------|-------|:-----------:|
| `AWS_ACCESS_KEY_ID` | do passo 1 | sim |
| `AWS_SECRET_ACCESS_KEY` | do passo 1 | sim |
| `AWS_SESSION_TOKEN` | do passo 1 (é longo, copie inteiro) | sim |
| `SONAR_TOKEN` | token do SonarCloud (passo 4) | recomendado |
| `SEED_PASSWORD` | senha dos usuários de demonstração (padrão: `Demo#Mentor2026`) | opcional |

## 3. Aprovação manual (opcional, mas vale mostrar)

**Settings → Environments → New environment** → nome `production` →
marque **Required reviewers** e adicione você. Assim o pipeline para e espera um clique de
aprovação antes de mexer na AWS.

## 4. SonarCloud (scanner exigido na atividade)

1. Entre em [sonarcloud.io](https://sonarcloud.io) com a conta do GitHub (gratuito para repositório público).
2. **+ → Analyze new project** → escolha o repositório `mentor-unidavi` → **Set up**.
3. Em **Administration → Analysis Method**, desligue a **Automatic Analysis** (a análise vem do pipeline).
4. Em **My Account → Security**, gere um token e crie o secret `SONAR_TOKEN` no GitHub.

A organização e a chave do projeto são deduzidas do nome do repositório (`dono_repositorio`, o padrão
do SonarCloud). Só se o SonarCloud mostrar valores diferentes, crie as **variables** `SONAR_ORGANIZATION`
e `SONAR_PROJECT_KEY` em *Settings → Secrets and variables → Actions → Variables*.

Sem o `SONAR_TOKEN`, o pipeline continua com Semgrep, Gitleaks, Checkov e Trivy e mostra um aviso.

## 5. Rodar o deploy

1. Aba **Actions → CI/CD Mentor UNIDAVI → Run workflow**.
2. Na primeira vez, marque **Criar os dados de demonstração**.
3. Clique em **Run workflow** e acompanhe:

```
testes → análise estática → imagem → deploy (aprovação)
```

4. No fim do job **Deploy na AWS**, o resumo mostra a **URL da aplicação** (`http://mentor-alb-....elb.amazonaws.com`).
   O RDS leva cerca de 10 minutos para ser criado no primeiro deploy, e as instâncias mais 3 a 5 minutos
   para ficar saudáveis. Antes disso a URL responde `502/503`.

Todo `push` na branch `main` roda o mesmo fluxo e atualiza a aplicação sem derrubá-la (instance refresh).
Enquanto os secrets da AWS não estiverem configurados, o pipeline roda testes e scans normalmente e
**pula o deploy** com um aviso (não fica vermelho).

### O que acontece quando uma instância sobe

1. Lê o segredo da aplicação (`JWT_SECRET`, senha do `mentor_app`) e o segredo do administrador do banco, que o próprio RDS gera.
2. Baixa a imagem do ECR privado.
3. Roda as migrações com o usuário administrador. Um lock no banco garante que só uma instância migra por vez.
4. Apaga a credencial de administrador e sobe a aplicação com o usuário de menor privilégio `mentor_app`.

## 6. Usuários para testar

Senha de todos: `Demo#Mentor2026` (ou o `SEED_PASSWORD`, se definido).

| Perfil | E-mail |
|--------|--------|
| Aluno | `aluno@demo.unidavi.edu.br` |
| Aluno com parcela vencida | `ana@demo.unidavi.edu.br` |
| Professor | `professor@demo.unidavi.edu.br` |
| Secretaria | `secretaria@demo.unidavi.edu.br` |

## 7. Depois da apresentação

**Actions → Destruir ambiente AWS → Run workflow** → digite `DESTRUIR`.
Remove toda a infraestrutura, inclusive o banco RDS, para não consumir o crédito do lab.

---

## O que o Terraform cria

| Recurso | Para quê |
|---------|----------|
| VPC `10.0.0.0/16`, 2 zonas | rede isolada |
| 2 subnets públicas (`10.0.1.0/24`, `10.0.2.0/24`) | só o Load Balancer e o NAT Gateway |
| 2 subnets privadas de aplicação (`10.0.11.0/24`, `10.0.12.0/24`) | instâncias da aplicação, sem IP público, saída só pelo NAT |
| 2 subnets privadas de dados (`10.0.21.0/24`, `10.0.22.0/24`) | banco RDS; tabela de rotas **sem rota para a internet** |
| Internet Gateway, NAT Gateway, rotas | entrada pelo ALB, saída controlada |
| NACLs (pública, aplicação, dados) | segunda barreira; bloqueiam SSH/RDP; dados só aceitam 5432 das subnets da aplicação |
| Security Groups encadeados | Internet → ALB (80/443) → App (8080) → Banco (5432) |
| Application Load Balancer | distribui o tráfego entre as zonas e faz health check |
| AWS WAF | regras OWASP, SQL Injection, IPs maliciosos e limite por IP |
| Auto Scaling Group (2 a 4 × t3.small) | escala por CPU (60%) |
| RDS PostgreSQL 16 | criptografado com KMS, TLS obrigatório, backup de 7 dias, senha gerenciada pelo RDS, sem IP público |
| ECR | registro privado das imagens, com scan e tags imutáveis |
| KMS (chave própria) | criptografa banco, segredos, imagens e logs |
| Secrets Manager | segredo da aplicação e senha do administrador do banco |
| CloudWatch | logs da aplicação, do banco e do WAF; alarme de erros 5xx |
| S3 de logs | Flow Logs da VPC e access logs do ALB |
| S3 do state | estado do Terraform (criado automaticamente pelo pipeline) |

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Aviso "Deploy pulado. Secrets não configurados" | faltou algum dos 3 secrets da AWS | conferir os nomes no passo 2 |
| `ExpiredToken` / `InvalidClientTokenId` | sessão do lab expirou | passo 1 e atualizar os 3 secrets |
| Erro ao criar `aws_wafv2_web_acl` (AccessDenied) | conta do lab sem permissão de WAF | em **Settings → Secrets and variables → Actions → Variables**, criar `HABILITAR_WAF` = `false` e rodar de novo (o requisito de WAF deixa de ser atendido: avise o professor) |
| Erro na chave KMS citando `LabRole` | a role do lab tem outro nome | em IAM → Roles, ache a role do `LabInstanceProfile` e crie a variável `LAB_ROLE_NAME` com esse nome |
| Erro ao criar `aws_db_instance` citando a classe da instância | classe não liberada no lab | criar a **variable** `DB_INSTANCE_CLASS` = `db.t4g.micro` (ou `db.t3.small`) e rodar de novo |
| URL responde 502/503 por mais de 15 min | instâncias não subiram | EC2 → Instâncias → Actions → Monitor → **Get system log**: procure `Aguardando segredo`, `Imagem ... ainda não disponível` ou `Banco ainda não disponível` |
| Pipeline parou em "Waiting for review" | aprovação manual (passo 3) | clicar em **Review deployments → Approve** |
