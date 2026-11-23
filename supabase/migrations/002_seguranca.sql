-- =====================================================================
-- Segurança no banco (menor privilégio + RLS)
-- 1) A API REST pública do Supabase (PostgREST, roles anon/authenticated)
--    NÃO acessa nenhuma tabela: RLS ligado e sem políticas para elas.
-- 2) A aplicação usa a role dedicada "mentor_app" (sem DDL, sem superuser).
-- Depois de rodar, defina a senha manualmente (NUNCA versionar senha):
--    alter role mentor_app with login password '<senha forte>';
-- =====================================================================
do $$ begin
  create role mentor_app nologin;
exception when duplicate_object then null; end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to mentor_app;
grant select, insert, update, delete on
  usuarios, alunos, disciplinas, turmas, turma_alunos, aulas, presencas,
  notas, parcelas, tipos_requerimento, requerimentos, jogo_perguntas, jogo_partidas
  to mentor_app;
grant select, insert on auditoria to mentor_app;    -- sem update/delete
grant usage, select on all sequences in schema public to mentor_app;

do $$
declare t text;
begin
  foreach t in array array['usuarios','alunos','disciplinas','turmas','turma_alunos','aulas','presencas',
                           'notas','parcelas','tipos_requerimento','requerimentos','jogo_perguntas',
                           'jogo_partidas','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists mentor_app_acesso on public.%I', t);
    if t = 'auditoria' then
      execute 'create policy mentor_app_acesso on public.auditoria for select to mentor_app using (true)';
      execute 'drop policy if exists mentor_app_insere on public.auditoria';
      execute 'create policy mentor_app_insere on public.auditoria for insert to mentor_app with check (true)';
    else
      execute format('create policy mentor_app_acesso on public.%I for all to mentor_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
