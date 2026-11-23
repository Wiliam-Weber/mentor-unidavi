'use strict';
const config = require('../config');
const { HttpError } = require('./errors');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defesa em profundidade contra CSRF (além do cookie SameSite=Strict):
// requisições que alteram estado exigem um header customizado, que um site
// de terceiros não consegue enviar sem CORS (e o CORS não é liberado).
function csrfGuard(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  if (req.get('X-Requested-With') !== 'mentor-web') {
    return next(new HttpError(403, 'Requisição bloqueada (proteção CSRF)'));
  }
  const origin = req.get('Origin');
  if (origin && config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(origin)) {
    return next(new HttpError(403, 'Origem não permitida'));
  }
  return next();
}

module.exports = { csrfGuard };
