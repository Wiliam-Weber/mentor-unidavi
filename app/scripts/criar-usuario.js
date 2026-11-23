'use strict';
// Uso: NOVA_SENHA='...' node scripts/criar-usuario.js --perfil secretaria --nome "Maria Souza" --email maria@unidavi.edu.br
// Sem NOVA_SENHA, uma senha temporária é gerada, exibida uma única vez e exigida a troca no 1º acesso.
const { parseArgs } = require('util');
const { conectar } = require('./_conexao');
const { politicaSenha, gerarHash, gerarSenhaTemporaria } = require('../src/utils/senha');

(async () => {
  const { values } = parseArgs({ options: { perfil: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string' } } });
  if (!['secretaria', 'professor'].includes(values.perfil) || !values.nome || !values.email) {
    console.error('Informe --perfil (secretaria|professor), --nome e --email. Alunos são cadastrados pela secretaria no sistema.');
    process.exit(1);
  }
  const definida = process.env.NOVA_SENHA;
  if (definida) {
    const r = politicaSenha.safeParse(definida);
    if (!r.success) { console.error(r.error.issues.map((i) => i.message).join('\n')); process.exit(1); }
  }
  const senha = definida || gerarSenhaTemporaria();
  const client = conectar();
  await client.connect();
  try {
    await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, troca_senha_obrigatoria) VALUES ($1, lower($2), $3, $4, $5)`,
      [values.nome, values.email, await gerarHash(senha), values.perfil, !definida],
    );
    console.log(`Usuário ${values.email} (${values.perfil}) criado.`);
    if (!definida) console.log(`Senha temporária (troca obrigatória no 1º acesso): ${senha}`);
  } catch (err) {
    console.error('Erro:', err.code === '23505' ? 'e-mail já cadastrado' : err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
