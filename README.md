# Mentor UNIDAVI – Auditoria e Segurança da Informação

Portal acadêmico (aluno, professor e secretaria) com **desenvolvimento seguro**, **Supabase** como banco,
infraestrutura **AWS em Terraform** e **pipeline DevSecOps** que roda scan estático a cada commit e
bloqueia o deploy se algo reprovar.

```
Usuário ──HTTPS──► AWS WAF ─► ALB (subnets públicas, 2 AZs)
                                 │  somente SG-ALB → 8080
                                 ▼
                    Auto Scaling 2–6 × EC2 (subnets privadas, sem IP público)
                    Docker endurecido · segredos do Secrets Manager (KMS)
                                 │  NAT Gateway · TLS
                                 ▼
                      Supabase PostgreSQL (role mentor_app + RLS)
```

## Funcionalidades

- **Aluno:** bolsa de estudos, dados cadastrais, mensagens, senha, requerimentos, material de apoio, rematrícula com aceite de contrato, avaliação institucional anônima, parcelas, horários, notas, faltas, atividades complementares, plano de ensino, contrato, eventos e certificados, documentos, informe de IR, histórico escolar e o jogo **Arremesso UNIDAVI** com ranking.
- **Professor:** notas, chamada e faltas justificadas, plano de ensino, material de apoio, mensagens para as turmas.
- **Secretaria:** matrícula, financeiro, requerimentos, bolsas, atividades complementares, documentos, eventos, mensagens, relatórios de rematrícula e avaliação, tipos de requerimento e links úteis.

## Estrutura

| Pasta | Conteúdo |
|-------|----------|
| `app/` | API Node.js 22 (Express 5) + frontend (HTML/CSS/JS sem framework) + testes |
| `supabase/migrations/` | Schema, segurança do banco (role, RLS, grants) e dados iniciais |
| `infra/` | Terraform: VPC, subnets, NAT, NACLs, Flow Logs, ALB, WAF, Auto Scaling, KMS, Secrets Manager, CloudWatch |
| `.github/workflows/` | Pipeline: testes → Gitleaks → SonarQube → Checkov → Trivy → build → scan da imagem → Terraform |
| `docs/` | `SPEC.md` (especificação SDD) e `SEGURANCA.md` (controles, OWASP, riscos aceitos) |

## 1. Banco de dados (Supabase)

1. Crie um projeto em supabase.com (região **East US**).
2. No botão **Connect → Session pooler**, copie a connection string. A senha do banco fica em
   **Database → Settings → Database password** (dá para resetar ali).
3. Na pasta `app/`, copie `.env.example` para `.env` e preencha:
   - `DATABASE_URL_ADMIN`: usuário `postgres.<ref>`, porta **5432**, senha do banco.
   - `DATABASE_URL`: usuário `mentor_app.<ref>`, porta **6543**, uma senha forte **inventada por você** (16+ caracteres).
   - `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
   - Use senhas só com letras e números, ou codifique `@ # / : %` na URL (`%40 %23 %2F %3A %25`).
4. Crie as tabelas. O `migrate` também define a senha do `mentor_app` igual à do `DATABASE_URL`
   (`SYNC_APP_PASSWORD=1` no `.env`):
   ```bash
   cd app
   npm ci
   npm run migrate
   ```
5. Dados de demonstração (usuários `@demo.unidavi.edu.br`, senha = `SEED_PASSWORD`):
   ```bash
   npm run seed:demo
   ```
   Ou, para um ambiente real, crie só o primeiro usuário da secretaria (a senha temporária aparece uma vez):
   ```bash
   npm run criar-usuario -- --perfil secretaria --nome "Secretaria Acadêmica" --email secretaria@unidavi.edu.br
   ```

## 2. Rodar localmente

```bash
cd app
npm start          # http://localhost:8080
npm test           # 42 testes (segurança da API e anti-trapaça do jogo)
```

| Perfil | E-mail (senha `Demo#Mentor2026`) |
|--------|--------|
| Aluno | `aluno@demo.unidavi.edu.br` |
| Aluno com parcela vencida | `ana@demo.unidavi.edu.br` |
| Professor | `professor@demo.unidavi.edu.br` |
| Secretaria | `secretaria@demo.unidavi.edu.br` |

## 3. Deploy na AWS (AWS Academy)

Tudo é feito pelo **GitHub Actions**: basta configurar os secrets e rodar o workflow.
Passo a passo completo, para quem nunca mexeu no projeto: **[docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md)**.

Resumo:
0. **Fork** do repositório para a sua conta (só o dono do repositório consegue cadastrar secrets).
1. Learner Lab → *Start Lab* → *AWS Details* → copiar as 3 credenciais.
2. GitHub → *Settings → Secrets and variables → Actions*: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `AWS_SESSION_TOKEN`, `DATABASE_URL_ADMIN`, `DATABASE_URL`, `JWT_SECRET` (e `SONAR_TOKEN`).
3. *Actions → CI/CD Mentor UNIDAVI → Run workflow* (marcar "dados de demonstração" na primeira vez).
4. A URL aparece no resumo do job **Deploy na AWS**.
5. Depois da apresentação: *Actions → Destruir ambiente AWS* (digitar `DESTRUIR`).

## 4. Pipeline (GitHub Actions)

```
testes ─► análise estática ─► imagem ─► banco ─► deploy
          Gitleaks             Docker    migrações  bucket do state
          Semgrep (SAST)       Trivy     (Supabase) KMS, ECR, segredo
          SonarQube + Gate                          push da imagem no ECR
          Checkov (Terraform)                       terraform apply
          Trivy (repositório)                       instance refresh
```

- Em **todo push e Pull Request**: testes, `npm audit` e todos os scans. **Qualquer achado HIGH/CRITICAL reprova e bloqueia o deploy.**
- Na **main**: depois da aprovação manual (environment `production`), migra o banco e publica na AWS.
- Todas as actions são fixadas pelo **hash do commit**, e não por tag (proteção contra ataque de supply chain), e o Gitleaks é baixado com verificação de SHA-256.
- Os segredos ficam só nos GitHub Secrets e no AWS Secrets Manager (criptografado com KMS): nunca no código nem no state do Terraform.
