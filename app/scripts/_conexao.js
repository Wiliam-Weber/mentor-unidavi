'use strict';
require('dotenv').config({ quiet: true });
const { Client } = require('pg');

// Scripts administrativos usam uma conexão de ADMIN separada (DATABASE_URL_ADMIN),
// nunca a credencial de menor privilégio da aplicação.
function conectar() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) {
    console.error('Defina DATABASE_URL_ADMIN (conexão postgres do Supabase) no .env');
    process.exit(1);
  }
  const ca = process.env.DB_SSL_CA_BASE64 ? Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString() : null;
  return new Client({ connectionString: url, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });
}

module.exports = { conectar };
