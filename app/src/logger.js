'use strict';
const pino = require('pino');
const config = require('./config');

// Logs estruturados em JSON (stdout -> CloudWatch). Dados sensíveis são mascarados.
module.exports = pino({
  level: config.env === 'test' ? 'silent' : config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.senha',
      '*.senhaAtual',
      '*.novaSenha',
      '*.senha_hash',
      '*.cpf',
    ],
    censor: '[REMOVIDO]',
  },
});
