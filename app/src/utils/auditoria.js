'use strict';

// Trilha de auditoria (tabela append-only no banco). Aceita o pool ou um client de transação.
async function registrar(conn, { usuarioId = null, acao, entidade = null, entidadeId = null, dados = null, ip = null }) {
  await conn.query(
    `INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, dados, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [usuarioId, acao, entidade, entidadeId ? String(entidadeId) : null, dados ? JSON.stringify(dados) : null, ip],
  );
}

module.exports = { registrar };
