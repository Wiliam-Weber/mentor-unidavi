'use strict';
const fs = require('fs');
const path = require('path');
const { conectar } = require('./_conexao');

(async () => {
  const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = conectar();
  await client.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS _migracoes (arquivo text primary key, aplicada_em timestamptz default now())');
    for (const arquivo of arquivos) {
      const ja = await client.query('SELECT 1 FROM _migracoes WHERE arquivo = $1', [arquivo]);
      if (ja.rowCount) { console.log(`= ${arquivo} (já aplicada)`); continue; }
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, arquivo), 'utf8'));
      await client.query('INSERT INTO _migracoes (arquivo) VALUES ($1)', [arquivo]);
      await client.query('COMMIT');
      console.log(`+ ${arquivo}`);
    }
    await client.query('ALTER TABLE _migracoes ENABLE ROW LEVEL SECURITY');
    await client.query('REVOKE ALL ON _migracoes FROM anon, authenticated');

    // Opcional (usado pelo pipeline): define a senha da role mentor_app igual à do DATABASE_URL,
    // assim ninguém precisa rodar o ALTER ROLE à mão no SQL Editor.
    if (process.env.SYNC_APP_PASSWORD === '1' && process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL);
      const usuario = decodeURIComponent(url.username).split('.')[0];
      const senha = decodeURIComponent(url.password);
      if (usuario !== 'mentor_app' || senha.length < 16) {
        throw new Error('DATABASE_URL precisa usar o usuário mentor_app e uma senha com pelo menos 16 caracteres');
      }
      // format(%L) escapa a senha com segurança (ALTER ROLE não aceita parâmetro $1)
      const { rows } = await client.query("SELECT format('ALTER ROLE mentor_app WITH LOGIN PASSWORD %L', $1::text) AS sql", [senha]);
      await client.query(rows[0].sql);
      console.log('Senha da role mentor_app sincronizada com o DATABASE_URL');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Falha na migração:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
