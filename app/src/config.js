'use strict';
require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  return valor;
}

const jwtSecret = obrigatoria('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres (use: openssl rand -base64 48)');
}

module.exports = Object.freeze({
  env,
  isProd: env === 'production',
  port: parseInt(process.env.PORT || '8080', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  // Certificado da autoridade do banco, para validar o TLS: arquivo (RDS, embutido na imagem)
  // ou base64 (Supabase: Database Settings > SSL Configuration)
  dbSslCa: require('./utils/ca-banco').lerCaBanco(),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  // Em produção com HTTPS deve ser "true". Só use "false" em ambiente sem certificado (ex.: lab sem domínio).
  cookieSecure: (process.env.COOKIE_SECURE || (env === 'production' ? 'true' : 'false')) === 'true',
  trustProxy: parseInt(process.env.TRUST_PROXY || '1', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug'),
});
