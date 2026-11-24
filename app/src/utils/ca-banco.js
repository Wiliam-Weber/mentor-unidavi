'use strict';
const fs = require('fs');

function lerCaBanco() {
  if (process.env.DB_SSL_CA_FILE) return fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf8');
  if (process.env.DB_SSL_CA_BASE64) return Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  return null;
}

module.exports = { lerCaBanco };
