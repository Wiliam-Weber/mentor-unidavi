-- =====================================================================
-- Mentor UNIDAVI - schema do banco (Supabase / PostgreSQL)
-- Executar no SQL Editor do Supabase ou com: npm run migrate
-- =====================================================================
create extension if not exists pgcrypto;

do $$ begin
  create type perfil_usuario as enum ('aluno', 'professor', 'secretaria');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_parcela as enum ('aberta', 'paga', 'cancelada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_requerimento as enum ('aberto', 'em_analise', 'deferido', 'indeferido');
exception when duplicate_object then null; end $$;

create table if not exists usuarios (
  id                      uuid primary key default gen_random_uuid(),
  nome                    text not null check (char_length(nome) between 3 and 120),
  email                   text not null check (char_length(email) <= 160),
  senha_hash              text not null,               -- bcrypt (custo 12); senha nunca é armazenada
  perfil                  perfil_usuario not null,
  ativo                   boolean not null default true,
  troca_senha_obrigatoria boolean not null default true,
  tentativas_falhas       int not null default 0,
  bloqueado_ate           timestamptz,
  token_version           int not null default 0,      -- incrementado para revogar sessões
  ultimo_login            timestamptz,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);
create unique index if not exists usuarios_email_uk on usuarios (lower(email));

create table if not exists alunos (
  usuario_id      uuid primary key references usuarios(id) on delete cascade,
  matricula       text not null unique,
  cpf             char(11) not null unique,
  curso           text not null,
  data_nascimento date,
  telefone        text,
  endereco        text
);

create table if not exists disciplinas (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique,
  nome                  text not null,
  carga_horaria         int not null check (carga_horaria > 0),
  ementa                text,
  objetivos             text,
  conteudo_programatico text,
  metodologia           text,
  avaliacao             text,
  bibliografia          text,
  plano_atualizado_em   timestamptz,
  plano_atualizado_por  uuid references usuarios(id)
);

create table if not exists turmas (
  id            uuid primary key default gen_random_uuid(),
  disciplina_id uuid not null references disciplinas(id),
  professor_id  uuid not null references usuarios(id),
  semestre      text not null check (semestre ~ '^\d{4}/[12]$'),
  dia_semana    smallint not null check (dia_semana between 1 and 7),  -- 1 = segunda
  hora_inicio   time not null,
  hora_fim      time not null,
  sala          text,
  check (hora_fim > hora_inicio)
);
create index if not exists turmas_professor_idx on turmas (professor_id);

create table if not exists turma_alunos (
  turma_id uuid not null references turmas(id) on delete cascade,
  aluno_id uuid not null references alunos(usuario_id) on delete cascade,
  primary key (turma_id, aluno_id)
);
create index if not exists turma_alunos_aluno_idx on turma_alunos (aluno_id);

create table if not exists aulas (
  id       uuid primary key default gen_random_uuid(),
  turma_id uuid not null references turmas(id) on delete cascade,
  data     date not null,
  conteudo text,
  criado_em timestamptz not null default now(),
  unique (turma_id, data)
);

create table if not exists presencas (
  id            uuid primary key default gen_random_uuid(),
  aula_id       uuid not null references aulas(id) on delete cascade,
  aluno_id      uuid not null references alunos(usuario_id) on delete cascade,
  presente      boolean not null,
  justificada   boolean not null default false,
  justificativa text,
  unique (aula_id, aluno_id)
);
create index if not exists presencas_aluno_idx on presencas (aluno_id);

create table if not exists notas (
  id            uuid primary key default gen_random_uuid(),
  turma_id      uuid not null references turmas(id) on delete cascade,
  aluno_id      uuid not null references alunos(usuario_id) on delete cascade,
  avaliacao     text not null,
  peso          numeric(4,2) not null check (peso > 0 and peso <= 10),
  nota          numeric(4,2) not null check (nota between 0 and 10),
  lancado_por   uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  unique (turma_id, aluno_id, avaliacao)
);
create index if not exists notas_aluno_idx on notas (aluno_id);

create table if not exists parcelas (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references alunos(usuario_id) on delete cascade,
  numero      int not null,
  competencia text not null,
  vencimento  date not null,
  valor       numeric(10,2) not null check (valor > 0),
  status      status_parcela not null default 'aberta',
  pago_em     timestamptz,
  criado_em   timestamptz not null default now(),
  unique (aluno_id, numero)
);

create table if not exists tipos_requerimento (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  descricao  text not null,
  prazo_dias int not null default 5 check (prazo_dias between 1 and 90),
  ativo      boolean not null default true
);

create table if not exists requerimentos (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       uuid not null references alunos(usuario_id) on delete cascade,
  tipo_id        uuid not null references tipos_requerimento(id),
  descricao      text not null check (char_length(descricao) between 10 and 2000),
  status         status_requerimento not null default 'aberto',
  resposta       text,
  respondido_por uuid references usuarios(id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists requerimentos_aluno_idx on requerimentos (aluno_id);
create index if not exists requerimentos_status_idx on requerimentos (status);

create table if not exists jogo_perguntas (
  id           uuid primary key default gen_random_uuid(),
  pergunta     text not null,
  alternativas jsonb not null check (jsonb_typeof(alternativas) = 'array'),
  correta      smallint not null check (correta >= 0),
  ativa        boolean not null default true
);

create table if not exists jogo_partidas (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references alunos(usuario_id) on delete cascade,
  perguntas     uuid[] not null,
  iniciada_em   timestamptz not null default now(),
  finalizada_em timestamptz,
  acertos       int not null default 0,
  pontuacao     int not null default 0
);
create index if not exists jogo_partidas_aluno_idx on jogo_partidas (aluno_id, iniciada_em);

-- Trilha de auditoria: append-only
create table if not exists auditoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid,
  acao        text not null,
  entidade    text,
  entidade_id text,
  dados       jsonb,
  ip          text,
  criado_em   timestamptz not null default now()
);
create index if not exists auditoria_usuario_idx on auditoria (usuario_id, criado_em);

create or replace function bloquear_alteracao_auditoria() returns trigger
language plpgsql as $$
begin
  raise exception 'A tabela auditoria é somente inserção (append-only)';
end $$;

drop trigger if exists auditoria_imutavel on auditoria;
create trigger auditoria_imutavel before update or delete on auditoria
  for each row execute function bloquear_alteracao_auditoria();
