-- Dados de referência (sem usuários: estes são criados por script, com senha fora do código)
insert into tipos_requerimento (nome, descricao, prazo_dias) values
  ('Revisão de nota', 'Solicitação de revisão de nota de avaliação', 5),
  ('Segunda chamada', 'Prova de segunda chamada com justificativa', 5),
  ('Declaração de matrícula', 'Emissão de declaração de vínculo', 2),
  ('Trancamento de disciplina', 'Trancamento de uma disciplina do semestre', 10),
  ('Aproveitamento de estudos', 'Validação de disciplina cursada em outra instituição', 15)
on conflict (nome) do nothing;

insert into disciplinas (codigo, nome, carga_horaria, ementa) values
  ('SI-AUD', 'Auditoria e Segurança da Informação', 72, 'Fundamentos de segurança, controles, auditoria de sistemas e normas ISO 27001/27002.'),
  ('SI-CLD', 'Cloud Computing', 72, 'Modelos de serviço e implantação em nuvem, IaC e arquitetura escalável.'),
  ('SI-IOT', 'Internet das Coisas', 72, 'Sensores, microcontroladores, protocolos MQTT e aplicações IoT.'),
  ('SI-GC',  'Gestão do Conhecimento', 72, 'Conhecimento organizacional, análise de dados e tomada de decisão.')
on conflict (codigo) do nothing;

insert into jogo_perguntas (pergunta, alternativas, correta)
select v.pergunta, v.alternativas::jsonb, v.correta from (values
  ('Em que cidade fica a sede da UNIDAVI?', '["Blumenau","Rio do Sul","Ituporanga","Taió"]', 1),
  ('Qual princípio da segurança garante que a informação não foi alterada indevidamente?', '["Confidencialidade","Disponibilidade","Integridade","Autenticidade"]', 2),
  ('O que significa a sigla MFA?', '["Multi-Factor Authentication","Main Firewall Access","Managed File Archive","Multiple Frame Algorithm"]', 0),
  ('Qual ferramenta faz análise estática de código (SAST) no nosso pipeline?', '["Terraform","SonarQube","Docker","Nginx"]', 1),
  ('Em uma VPC, onde deve ficar o servidor de aplicação?', '["Subnet pública com IP público","Subnet privada atrás do Load Balancer","Fora da VPC","Na mesma subnet do Internet Gateway"]', 1),
  ('Qual ataque é evitado com consultas parametrizadas?', '["DDoS","Phishing","SQL Injection","Ransomware"]', 2),
  ('Qual a frequência mínima exigida para aprovação na maioria das disciplinas?', '["50%","60%","75%","90%"]', 2),
  ('A LGPD trata principalmente de:', '["Proteção de dados pessoais","Licitações públicas","Direitos autorais de software","Tributação digital"]', 0),
  ('O que o Terraform permite fazer?', '["Editar imagens","Infraestrutura como código","Testar senhas","Compactar arquivos"]', 1),
  ('Qual destes é um bom exemplo de senha forte?', '["123456","unidavi2026","S3gur@nc4!Mentor","senha"]', 2)
) as v(pergunta, alternativas, correta)
where not exists (select 1 from jogo_perguntas);
