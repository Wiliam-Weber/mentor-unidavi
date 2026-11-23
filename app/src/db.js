'use strict';
const { Pool, types } = require('pg');
const config = require('./config');
const logger = require('./logger');

// Colunas DATE voltam como texto 'AAAA-MM-DD' (evita deslocar o dia por causa do fuso horário)
types.setTypeParser(1082, (valor) => valor);

let pool;

function sslOptions() {
  if (config.dbSslCa) return { ca: config.dbSslCa, rejectUnauthorized: true };
  if (config.isProd) {
    logger.warn('DB_SSL_CA_BASE64 não definido: conexão TLS sem validação do certificado do Supabase');
  }
  return { rejectUnauthorized: false };
}

function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada');
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: sslOptions(),
      max: config.dbPoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      application_name: 'mentor-api',
    });
    pool.on('error', (err) => logger.error({ err }, 'erro no pool do banco'));
  }
  return pool;
}

// Sempre consultas parametrizadas ($1, $2...) -> proteção contra SQL Injection
function query(text, params) {
  return getPool().query(text, params);
}

async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { query, transaction, close };
