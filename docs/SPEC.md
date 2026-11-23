# Especificação do sistema (SDD – Spec-Driven Development)

Este documento é a fonte da verdade do projeto: primeiro a especificação, depois o código.
Cada requisito tem um identificador que aparece nos testes e na rastreabilidade ao final.

## 1. Visão geral

**Mentor UNIDAVI** é um portal acadêmico com três perfis (aluno, professor e secretaria),
implantado na AWS com infraestrutura como código (Terraform), banco de dados Supabase
(PostgreSQL) e pipeline DevSecOps que bloqueia o deploy quando um scan de segurança reprova.

## 2. Perfis e requisitos funcionais

### Aluno
| ID | Requisito | Critério de aceite |
|----|-----------|-------------------|
| RF-A01 | Quadro de horários | Mostra as turmas do aluno por dia da semana, com horário, professor e sala |
| RF-A02 | Conceitos e notas | Lista avaliações por disciplina; calcula média ponderada e conceito (A ≥ 9, B ≥ 7, C ≥ 5, D < 5) |
| RF-A03 | Controle de faltas | Frequência = (presenças + faltas justificadas) / chamadas registradas; alerta abaixo de 75% |
| RF-A04 | Jogo com ranking (Arremesso UNIDAVI) | Partida de basquete de 60 s em canvas; arrastar para mirar; 2 ou 3 pontos conforme a distância, +1 no swish, +1 com 3 cestas seguidas, pontos em dobro nos últimos 10 s; ranking geral e da semana com o melhor placar de cada aluno |
| RF-A05 | Requerimentos | Abre requerimento de um tipo ativo e acompanha situação e resposta |
| RF-A06 | Financeiro/parcelas | Lista parcelas com situação (paga, em aberto, vencida, cancelada) e total em aberto |
| RF-A07 | Alteração de senha | Exige senha atual e nova senha dentro da política |
| RF-A08 | Plano de ensino | Consulta o plano das disciplinas em que está matriculado |
| RF-A09 | Dados cadastrais | Consulta os dados (CPF mascarado) e altera apenas telefone e endereço |
| RF-A10 | Solicitação de bolsa | Solicita bolsa (UNIEDU art. 170/171, desconto institucional, convênio) informando renda e composição familiar; uma por programa e semestre |
| RF-A11 | Caixa de mensagens | Recebe mensagens individuais, da turma e gerais; marca como lida; envia para a secretaria |
| RF-A12 | Material de apoio | Consulta materiais publicados pelos professores das suas turmas |
| RF-A13 | Rematrícula | Escolhe turmas do próximo semestre, sem choque de horário, e aceita o contrato; bloqueada se houver parcela vencida |
| RF-A14 | Avaliação institucional | Avalia cada disciplina (6 perguntas, escala 1–5) uma única vez, de forma anônima |
| RF-A15 | Atividades complementares | Cadastra atividades para validação e acompanha o total de horas (validadas + eventos) frente às 200 h exigidas |
| RF-A16 | Contrato | Consulta os contratos aceitos com data, IP mascarado e verificação de integridade (SHA-256) |
| RF-A17 | Eventos e certificados | Inscreve-se em eventos com vagas; recebe certificado com código de validação após a presença |
| RF-A18 | Entrega de documentos | Consulta a situação de cada documento obrigatório |
| RF-A19 | Informe de pagamentos | Emite o informe anual para o Imposto de Renda |
| RF-A20 | Histórico escolar | Médias, frequência, situação e coeficiente de rendimento por semestre, com impressão |

### Professor
| ID | Requisito | Critério de aceite |
|----|-----------|-------------------|
| RF-P01 | Cadastro de notas | Lança/corrige notas (0 a 10) por avaliação e peso, somente para alunos das próprias turmas |
| RF-P02 | Presenças e faltas justificadas | Registra chamada por data (não futura) e justifica faltas |
| RF-P03 | Plano de ensino | Edita ementa, objetivos, conteúdo, metodologia, avaliação e bibliografia das disciplinas que leciona |
| RF-P04 | Alteração de senha | Igual a RF-A07 |
| RF-P05 | Material de apoio | Publica e remove materiais (links https) nas próprias turmas |
| RF-P06 | Mensagens | Envia mensagens para as próprias turmas e para a secretaria |

### Secretaria
| ID | Requisito | Critério de aceite |
|----|-----------|-------------------|
| RF-S01 | Financeiro | Gera parcelas mensais, registra pagamento e cancela parcelas em aberto |
| RF-S02 | Cadastro de aluno (matrícula) | Cadastra aluno com CPF válido, gera senha temporária (exibida uma vez) e matricula em turmas |
| RF-S03 | Requerimentos | Visualiza todos, filtra por situação e responde (em análise, deferido, indeferido) |
| RF-S04 | Tipos de requerimento | Cadastra, ativa e desativa tipos |
| RF-S05 | Gestão de acesso | Ativa/desativa acesso do aluno e redefine a senha |
| RF-S06 | Bolsas | Analisa solicitações ordenadas por renda per capita; defere com percentual ou indefere com resposta |
| RF-S07 | Atividades complementares | Valida atividades, podendo aceitar menos horas que as informadas |
| RF-S08 | Documentos | Atualiza a situação de cada documento do aluno; recusa exige motivo |
| RF-S09 | Eventos | Cadastra eventos e confirma presença, o que gera o certificado |
| RF-S10 | Mensagens | Envia mensagens a um aluno ou a todos |
| RF-S11 | Relatórios | Acompanha rematrículas e o resultado agregado da avaliação institucional |
| RF-S12 | Links úteis | Mantém os links exibidos na tela inicial (somente https) |

## 3. Requisitos não funcionais de segurança

| ID | Requisito | Implementação |
|----|-----------|---------------|
| RNF-01 | Senhas armazenadas com hash forte | bcrypt custo 12 (`utils/senha.js`) |
| RNF-02 | Política de senha | ≥ 10 caracteres, maiúscula, minúscula, número e especial |
| RNF-03 | Proteção contra força bruta | 10 tentativas/15 min por IP + bloqueio da conta por 15 min após 5 falhas |
| RNF-04 | Sessão segura | JWT HS256 (2 h) em cookie `httpOnly`, `SameSite=Strict`, `Secure` com HTTPS |
| RNF-05 | Revogação de sessão | `token_version` incrementado no logout, troca de senha e desativação |
| RNF-06 | Controle de acesso (RBAC) | Middleware `exigirPerfil` em todas as rotas por perfil |
| RNF-07 | Controle de acesso por objeto | Aluno só vê os próprios dados; professor só as próprias turmas (404 para os demais) |
| RNF-08 | Validação de entrada | Zod com allowlist (`.strict()`), limites de tamanho e tipos |
| RNF-09 | SQL Injection | 100% das consultas parametrizadas (`$1, $2…`) |
| RNF-10 | XSS | CSP sem inline; frontend usa apenas `textContent` |
| RNF-11 | CSRF | Cookie `SameSite=Strict` + header obrigatório `X-Requested-With` |
| RNF-12 | Trilha de auditoria | Tabela `auditoria` append-only (trigger bloqueia UPDATE/DELETE) |
| RNF-13 | Menor privilégio no banco | Role `mentor_app` sem DDL; RLS ativo; API pública do Supabase sem acesso |
| RNF-14 | LGPD | CPF mascarado na exibição, ranking com nome abreviado, logs com dados sensíveis redigidos |
| RNF-15 | Segredos fora do código | Secrets Manager (KMS) carregado no boot da EC2 |
| RNF-16 | Escalabilidade | Aplicação stateless, ALB + Auto Scaling (2 a 6 instâncias), pool via Supavisor |
| RNF-17 | Disponibilidade | 2 zonas de disponibilidade, health check, instance refresh sem downtime |
| RNF-18 | Pipeline seguro | Gitleaks, SonarQube (Quality Gate), Checkov, Trivy (repo e imagem), npm audit |
| RNF-19 | Anti-trapaça no jogo | Semente gerada no servidor; cliente envia só (instante, ângulo, força); servidor re-simula a física e rejeita arremessos impossíveis |
| RNF-20 | Anonimato da avaliação | Participação e respostas em tabelas sem ligação; data sem hora; sem auditoria por aluno; limite mínimo de respostas |
| RNF-21 | Não repúdio do contrato | Aceite registra SHA-256 do texto, versão, data e IP; registro imutável (sem UPDATE/DELETE) |
| RNF-22 | Autenticidade de certificados | Código aleatório criptográfico; validação pública com rate limit e exposição mínima de dados |
| RNF-23 | Links seguros | Materiais e links aceitam apenas https; links externos abrem com `rel="noopener noreferrer"` |

## 4. Regras de negócio

- RN-01: média de aprovação 7,0; frequência mínima 75%.
- RN-02: jogo limitado a 10 partidas/dia por aluno; partida expira em 5 minutos; cada partida só pode ser respondida uma vez; gabarito nunca é enviado antes da resposta.
- RN-03: aluno pode ter no máximo 10 requerimentos em aberto.
- RN-04: requerimento finalizado (deferido/indeferido) não pode ser alterado.
- RN-05: só parcelas em aberto podem ser pagas ou canceladas.
- RN-06: usuário criado pela secretaria recebe senha temporária e é obrigado a trocá-la no primeiro acesso.
- RN-07: jogo de basquete limitado a 15 partidas/dia; a partida dura 60 s e deve ser enviada em até 30 s após o fim; a pontuação é sempre calculada no servidor.
- RN-08: rematrícula exige não ter parcelas vencidas, aceitar o contrato vigente e não ter choque de horário (máximo de 8 disciplinas).
- RN-09: resultados da avaliação institucional só são exibidos com pelo menos 3 respostas por turma.
- RN-10: atividades complementares exigidas: 200 h; horas de eventos com presença confirmada contam automaticamente.

## 5. API (resumo)

| Método | Rota | Perfil |
|--------|------|--------|
| POST | /api/auth/login · /logout · /alterar-senha | público / autenticado |
| GET | /api/auth/me | autenticado |
| GET | /api/aluno/horarios · notas · frequencia · planos · parcelas · requerimentos · tipos-requerimento · perfil | aluno |
| POST | /api/aluno/requerimentos | aluno |
| PATCH | /api/aluno/perfil | aluno |
| POST | /api/jogo/partidas · /partidas/:id/respostas | aluno |
| GET | /api/jogo/ranking | aluno |
| GET | /api/professor/turmas · turmas/:id/alunos · notas · aulas · faltas · planos | professor |
| PUT | /api/professor/turmas/:id/notas · planos/:id | professor |
| POST | /api/professor/turmas/:id/aulas | professor |
| PATCH | /api/professor/presencas/:id/justificativa | professor |
| GET/POST | /api/secretaria/alunos · alunos/:id/turmas · parcelas · tipos-requerimento | secretaria |
| PATCH | /api/secretaria/alunos/:id/status · parcelas/:id/pagamento · parcelas/:id/cancelamento · requerimentos/:id · tipos-requerimento/:id | secretaria |
| POST | /api/secretaria/alunos/:id/redefinir-senha · parcelas/gerar | secretaria |

## 6. Rastreabilidade

| Requisito | Código | Teste |
|-----------|--------|-------|
| RNF-04, RNF-06 | `middleware/auth.js` | "exige autenticação", "token forjado", "algoritmo none" |
| RNF-08 | `middleware/validate.js` | "campos extras são rejeitados", "corpo muito grande" |
| RNF-10 | `app.js` (helmet) | "envia cabeçalhos de segurança" |
| RNF-11 | `middleware/csrf.js` | "POST sem header anti-CSRF" |
| RNF-02 | `utils/senha.js` | "política de senha", "senha temporária" |
| RNF-14 | `utils/formatos.js` | "validação e máscara de CPF" |
| RNF-19 | `public/js/basquete-fisica.js`, `routes/basquete.js` | `basquete.test.js` (determinismo, arremesso com bola no ar, limites físicos) |
| RNF-22 | `utils/codigos.js`, `routes/eventos.js` | "código de certificado", "validação pública de certificado" |
