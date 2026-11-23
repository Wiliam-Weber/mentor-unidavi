# Segurança – controles implementados

## Camadas (defesa em profundidade)

| Camada | Controle |
|--------|----------|
| Borda | AWS WAF (OWASP comuns, SQLi, entradas maliciosas/Log4Shell, IPs de má reputação, limite de 1000 req/5 min por IP) |
| Rede | VPC com subnets públicas (só ALB e NAT) e privadas (EC2 sem IP público); NACLs bloqueando 22/3389; VPC Flow Logs |
| Acesso à instância | Security Group da aplicação aceita apenas o ALB; sem SSH aberto |
| Instância | IMDSv2 obrigatório, disco criptografado, atualizações de segurança no boot |
| Container | usuário não-root, sistema de arquivos somente leitura, `--cap-drop ALL`, `no-new-privileges`, limites de memória e processos |
| Aplicação | RBAC, controle por objeto, validação de entrada, CSP, anti-CSRF, rate limit, bloqueio de conta, auditoria |
| Dados | Supabase com TLS, role de menor privilégio, RLS, auditoria append-only |
| Segredos | Secrets Manager criptografado com KMS (CMK com rotação anual) |
| Observabilidade | CloudWatch Logs (KMS, 1 ano), logs do WAF, access logs do ALB, alarme de 5xx |
| Pipeline | Gitleaks (binário verificado por SHA-256), Semgrep (133 regras de segurança fixadas), SonarQube + Quality Gate, Checkov, Trivy (repositório e imagem), npm audit, aprovação manual, actions fixadas por hash de commit |
| Imagens | ECR privado com scan no push, tags imutáveis e criptografia KMS; a imagem publicada é a mesma que passou no Trivy (artefato, sem rebuild) |

## OWASP Top 10 (2021)

| Risco | Mitigação no projeto |
|-------|----------------------|
| A01 Quebra de controle de acesso | `exigirPerfil` em todas as rotas, filtro por `req.user.id`, verificação de turma do professor (retorna 404) |
| A02 Falhas criptográficas | bcrypt 12, TLS até o Supabase, KMS, HSTS, cookie `Secure` com HTTPS |
| A03 Injeção | Consultas parametrizadas, escape de curingas no `ILIKE`, Zod, WAF SQLi |
| A04 Design inseguro | SDD com regras de negócio explícitas (limites do jogo, gabarito no servidor, senha temporária) |
| A05 Configuração incorreta | Helmet, `x-powered-by` desativado, erros genéricos, Checkov no Terraform |
| A06 Componentes vulneráveis | `npm audit` e Trivy bloqueando HIGH/CRITICAL (o pipeline já forçou a troca do Zod 3 → 4 por CVE) |
| A07 Falhas de autenticação | Política de senha, bloqueio de conta, rate limit, mensagem genérica, tempo constante para e-mail inexistente |
| A08 Integridade de software | Actions do GitHub fixadas por hash de commit, binários conferidos por SHA-256, imagem com tag imutável no ECR, scan antes do push, aprovação manual do deploy |
| A09 Falhas de log e monitoramento | Auditoria de ações sensíveis, logs JSON com dados sensíveis redigidos, alarmes |
| A10 SSRF | A aplicação não busca URLs externas; IMDSv2 com hop limit 1 |

## Controles por funcionalidade

| Funcionalidade | Risco | Controle |
|----------------|-------|----------|
| Jogo de basquete | Aluno forjar o placar pelo DevTools | O servidor sorteia a semente, recebe só os comandos e **re-simula a física** (mesmo arquivo do navegador). Rejeita arremesso antes da bola anterior cair, valores fora dos limites e partidas enviadas mais rápido que o tempo real |
| Avaliação institucional | Identificar quem deu nota baixa | Participação e resposta em tabelas separadas, data sem hora, sem log de auditoria por aluno, resultado oculto com menos de 3 respostas |
| Contrato | Aluno negar que aceitou / alteração do texto | SHA-256 do texto aceito, versão, data e IP; o aceite só vale se o hash enviado for o do texto vigente; tabela sem UPDATE/DELETE |
| Certificados | Certificado falsificado | Código aleatório de 60 bits (crypto); validação pública mostra só o que está impresso; rate limit contra enumeração |
| Bolsas | Exposição de renda (LGPD) | Visível só para o aluno e a secretaria; renda fora dos logs |
| Mensagens | Ler mensagem de outra pessoa / spam | Destinatário conferido na consulta e ao marcar como lida (404 para mensagens alheias); quem pode enviar para onde é definido por perfil; 30 envios por hora |
| Material e links | Link malicioso (`javascript:`, phishing via http) | Somente https, validado na API e no banco (CHECK); `rel="noopener noreferrer"` |
| Eventos | Estourar vagas com inscrições simultâneas | `SELECT ... FOR UPDATE` na transação |
| Rematrícula | Rematricular com dívida / choque de horário | Regras verificadas no servidor dentro de uma transação |

## Riscos aceitos (exceções do Checkov)

| Exceção | Motivo | Como resolver em produção |
|---------|--------|---------------------------|
| HTTP sem TLS no ALB (CKV_AWS_260, 103, 378, CKV2_AWS_20) | AWS Academy não oferece domínio para emitir certificado no ACM | Preencher `certificate_arn`: o Terraform cria o listener 443 e passa a redirecionar o 80 |
| Bucket de logs sem KMS/replicação/notificações (CKV_AWS_18, 144, 145, CKV2_AWS_62) | Access logs do ALB exigem SSE-S3; replicação e notificações não se aplicam ao lab | Conta dedicada de logs com Object Lock |
| Sem proteção contra exclusão do ALB (CKV_AWS_150) | Permitir `terraform destroy` ao fim da aula | `alb_deletion_protection = true` |
| Sem rotação automática do segredo (CKV2_AWS_57) | Rotação exige Lambda e role IAM, bloqueados no Academy | Procedimento manual abaixo |
| Saída 5432/6543 para 0.0.0.0/0 | Supabase não publica faixa de IP fixa | Supabase com IPv4 dedicado/Private Link |

### Rotação manual de credenciais
1. Gere nova senha para `mentor_app` no Supabase (`alter role mentor_app with password '...'`) e/ou novo `JWT_SECRET`.
2. Atualize o segredo: `aws secretsmanager put-secret-value --secret-id mentor/app --secret-string file://segredo.json`.
3. Inicie um instance refresh: `aws autoscaling start-instance-refresh --auto-scaling-group-name <asg>`.
4. Trocar o `JWT_SECRET` encerra todas as sessões abertas (comportamento esperado).

### Limitação conhecida do jogo
A re-simulação impede placares falsos, mas não impede um "robô" que calcule a mira perfeita e envie comandos válidos.
Isso é inerente a jogos cujo cliente roda no navegador. Mitigações: limite de 15 partidas por dia, rate limit e auditoria das partidas rejeitadas (`JOGO_PARTIDA_REJEITADA`).

## Resposta a incidentes (resumo)
- Conta comprometida: secretaria desativa o acesso (revoga sessões na hora) e redefine a senha.
- Vazamento de segredo: rotação acima + `git log` verificado pelo Gitleaks.
- Ataque volumétrico: limites do WAF e do Express; Auto Scaling absorve picos legítimos.
