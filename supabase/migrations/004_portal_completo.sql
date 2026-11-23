-- =====================================================================
-- 004 - Portal completo: mensagens, material de apoio, bolsas, atividades
-- complementares, eventos/certificados, documentos, avaliação institucional
-- anônima, rematrícula + contrato, links úteis e o jogo de basquete.
-- =====================================================================

-- ---------- Caixa de mensagens ----------
create table if not exists mensagens (
  id                uuid primary key default gen_random_uuid(),
  remetente_id      uuid not null references usuarios(id),
  destinatario_id   uuid references usuarios(id),        -- mensagem individual
  turma_id          uuid references turmas(id),          -- professor -> turma
  para_todos_alunos boolean not null default false,      -- secretaria -> todos
  para_secretaria   boolean not null default false,      -- aluno/professor -> secretaria
  assunto           text not null check (char_length(assunto) between 3 and 120),
  corpo             text not null check (char_length(corpo) between 1 and 4000),
  criado_em         timestamptz not null default now(),
  check (num_nonnulls(destinatario_id, turma_id) + para_todos_alunos::int + para_secretaria::int = 1)
);
create index if not exists mensagens_dest_idx on mensagens (destinatario_id);
create index if not exists mensagens_turma_idx on mensagens (turma_id);

create table if not exists mensagens_leituras (
  mensagem_id uuid not null references mensagens(id) on delete cascade,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  lida_em     timestamptz not null default now(),
  primary key (mensagem_id, usuario_id)
);

-- ---------- Material de apoio ----------
create table if not exists materiais (
  id           uuid primary key default gen_random_uuid(),
  turma_id     uuid not null references turmas(id) on delete cascade,
  professor_id uuid not null references usuarios(id),
  titulo       text not null check (char_length(titulo) between 3 and 120),
  descricao    text check (char_length(descricao) <= 2000),
  url          text check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  criado_em    timestamptz not null default now()
);
create index if not exists materiais_turma_idx on materiais (turma_id);

-- ---------- Bolsas de estudo ----------
do $$ begin
  create type status_bolsa as enum ('enviada', 'em_analise', 'deferida', 'indeferida');
exception when duplicate_object then null; end $$;

create table if not exists bolsas (
  id              uuid primary key default gen_random_uuid(),
  aluno_id        uuid not null references alunos(usuario_id) on delete cascade,
  semestre        text not null,
  programa        text not null check (programa in ('uniedu_170', 'uniedu_171', 'desconto_unidavi', 'convenio_empresa')),
  renda_familiar  numeric(10,2) not null check (renda_familiar >= 0),
  membros_familia int not null check (membros_familia between 1 and 20),
  justificativa   text not null check (char_length(justificativa) between 20 and 3000),
  status          status_bolsa not null default 'enviada',
  percentual      numeric(5,2) check (percentual between 0 and 100),
  resposta        text,
  analisado_por   uuid references usuarios(id),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (aluno_id, semestre, programa)
);

-- ---------- Atividades complementares ----------
create table if not exists atividades_complementares (
  id              uuid primary key default gen_random_uuid(),
  aluno_id        uuid not null references alunos(usuario_id) on delete cascade,
  titulo          text not null check (char_length(titulo) between 3 and 160),
  categoria       text not null check (categoria in ('ensino', 'pesquisa', 'extensao', 'cultural', 'profissional')),
  horas           int not null check (horas between 1 and 200),
  data            date not null,
  descricao       text check (char_length(descricao) <= 2000),
  status          text not null default 'enviada' check (status in ('enviada', 'aprovada', 'reprovada')),
  horas_aprovadas int check (horas_aprovadas between 0 and 200),
  parecer         text,
  avaliado_por    uuid references usuarios(id),
  criado_em       timestamptz not null default now()
);
create index if not exists atividades_aluno_idx on atividades_complementares (aluno_id);

-- ---------- Eventos e certificados ----------
create table if not exists eventos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(titulo) between 3 and 160),
  descricao     text,
  local         text,
  data          date not null,
  carga_horaria int not null check (carga_horaria between 1 and 200),
  vagas         int not null check (vagas between 1 and 5000),
  criado_por    uuid references usuarios(id),
  criado_em     timestamptz not null default now()
);

create table if not exists eventos_inscricoes (
  evento_id          uuid not null references eventos(id) on delete cascade,
  aluno_id           uuid not null references alunos(usuario_id) on delete cascade,
  inscrito_em        timestamptz not null default now(),
  presente           boolean not null default false,
  codigo_certificado text unique,  -- gerado aleatoriamente ao confirmar presença
  primary key (evento_id, aluno_id)
);

-- ---------- Entrega de documentos ----------
create table if not exists documentos_aluno (
  aluno_id      uuid not null references alunos(usuario_id) on delete cascade,
  tipo          text not null,
  status        text not null default 'pendente' check (status in ('pendente', 'entregue', 'aprovado', 'recusado')),
  observacao    text,
  atualizado_em timestamptz not null default now(),
  primary key (aluno_id, tipo)
);

-- ---------- Avaliação institucional (anônima) ----------
-- Quem respondeu fica separado do que foi respondido: não há ligação entre aluno e resposta.
create table if not exists avaliacao_participacoes (
  aluno_id     uuid not null references alunos(usuario_id) on delete cascade,
  turma_id     uuid not null references turmas(id) on delete cascade,
  respondida_em date not null default current_date,
  primary key (aluno_id, turma_id)
);

create table if not exists avaliacao_respostas (
  id         bigint generated always as identity primary key,
  turma_id   uuid not null references turmas(id) on delete cascade,
  pergunta   smallint not null check (pergunta between 1 and 20),
  nota       smallint not null check (nota between 1 and 5),
  comentario text check (char_length(comentario) <= 1000),
  -- só a data (sem hora) para dificultar correlacionar resposta e participação
  criado_em  date not null default current_date
);
create index if not exists avaliacao_respostas_turma_idx on avaliacao_respostas (turma_id);

-- ---------- Rematrícula e contrato ----------
create table if not exists contratos_aceites (
  aluno_id       uuid not null references alunos(usuario_id) on delete cascade,
  semestre       text not null,
  versao         text not null,
  hash_documento char(64) not null,   -- SHA-256 do texto aceito (prova de integridade)
  aceito_em      timestamptz not null default now(),
  ip             text,
  primary key (aluno_id, semestre)
);

create table if not exists rematriculas (
  aluno_id     uuid not null references alunos(usuario_id) on delete cascade,
  semestre     text not null,
  turmas       uuid[] not null,
  confirmada_em timestamptz not null default now(),
  primary key (aluno_id, semestre)
);

-- ---------- Links úteis (gerenciados pela secretaria) ----------
create table if not exists links_uteis (
  id        uuid primary key default gen_random_uuid(),
  titulo    text not null check (char_length(titulo) between 2 and 60),
  url       text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------- Jogo de basquete ----------
create table if not exists basquete_partidas (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references alunos(usuario_id) on delete cascade,
  semente          int not null,
  iniciada_em      timestamptz not null default now(),
  finalizada_em    timestamptz,
  pontos           int not null default 0,
  cestas           int not null default 0,
  arremessos       int not null default 0,
  swishes          int not null default 0,
  melhor_sequencia int not null default 0
);
create index if not exists basquete_aluno_idx on basquete_partidas (aluno_id, iniciada_em);
create index if not exists basquete_ranking_idx on basquete_partidas (pontos desc) where finalizada_em is not null;

-- ---------- Novas disciplinas (oferta do próximo semestre) ----------
insert into disciplinas (codigo, nome, carga_horaria, ementa) values
  ('SI-TCC2', 'Trabalho de Conclusão de Curso II', 72, 'Desenvolvimento e defesa do trabalho de conclusão de curso.'),
  ('SI-GTI',  'Governança de TI', 72, 'COBIT, ITIL, alinhamento estratégico e gestão de riscos de TI.'),
  ('SI-EMP',  'Empreendedorismo e Inovação', 36, 'Modelos de negócio, startups e inovação tecnológica.'),
  ('SI-MOB',  'Desenvolvimento Mobile', 72, 'Aplicações móveis multiplataforma, armazenamento local e APIs.')
on conflict (codigo) do nothing;

insert into tipos_requerimento (nome, descricao, prazo_dias) values
  ('Exercícios domiciliares', 'Regime especial de exercícios domiciliares (atestado médico ou licença)', 5),
  ('Histórico escolar oficial', 'Emissão do histórico escolar assinado', 5)
on conflict (nome) do nothing;

insert into links_uteis (titulo, url, ordem)
select 'Site da UNIDAVI', 'https://www.unidavi.edu.br', 1
where not exists (select 1 from links_uteis);

-- ---------- Permissões: menor privilégio + RLS ----------
do $$
declare t text;
begin
  foreach t in array array['mensagens','mensagens_leituras','materiais','bolsas','atividades_complementares',
                           'eventos','eventos_inscricoes','documentos_aluno','avaliacao_participacoes',
                           'contratos_aceites','rematriculas','links_uteis','basquete_partidas'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to mentor_app', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists mentor_app_acesso on public.%I', t);
    execute format('create policy mentor_app_acesso on public.%I for all to mentor_app using (true) with check (true)', t);
  end loop;
end $$;

-- Respostas anônimas: só inserir e ler (ninguém altera nem apaga avaliação)
revoke all on avaliacao_respostas from anon, authenticated;
grant select, insert on avaliacao_respostas to mentor_app;
alter table avaliacao_respostas enable row level security;
drop policy if exists mentor_app_le on avaliacao_respostas;
drop policy if exists mentor_app_insere on avaliacao_respostas;
create policy mentor_app_le on avaliacao_respostas for select to mentor_app using (true);
create policy mentor_app_insere on avaliacao_respostas for insert to mentor_app with check (true);
-- Contrato aceito também não pode ser alterado depois
revoke update, delete on contratos_aceites from mentor_app;
grant usage, select on all sequences in schema public to mentor_app;
