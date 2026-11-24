'use strict';
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { lerCaBanco } = require('../src/utils/ca-banco');

// Scripts administrativos usam uma conexão de ADMIN separada (DATABASE_URL_ADMIN),
// nunca a credencial de menor privilégio da aplicação.
function conectar() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) {
    console.error('Defina DATABASE_URL_ADMIN (conexão de administrador do PostgreSQL) no .env');
    process.exit(1);
  }
  const ca = lerCaBanco();
  // Banco local de desenvolvimento sem TLS: DB_SSL=false
  if (process.env.DB_SSL === 'false') return new Client({ connectionString: url });
  return new Client({ connectionString: url, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });
}

module.exports = { conectar };
