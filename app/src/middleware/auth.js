'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError } = require('./errors');

const COOKIE = 'mentor_sessao';
const JWT_OPTS = { issuer: 'mentor-unidavi', audience: 'mentor-web' };

function emitirSessao(res, usuario) {
  const token = jwt.sign(
    { sub: usuario.id, perfil: usuario.perfil, tv: usuario.token_version },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.jwtExpiresIn, ...JWT_OPTS },
  );
  res.cookie(COOKIE, token, {
    httpOnly: true, // inacessível ao JavaScript (mitiga roubo de sessão via XSS)
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  });
}

function encerrarSessao(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' });
}

// options.permitirTrocaPendente: rotas acessíveis mesmo com troca de senha obrigatória pendente
function autenticar(options = {}) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Não autenticado');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], ...JWT_OPTS });
    } catch {
      throw new HttpError(401, 'Sessão inválida ou expirada');
    }

    // Revalida no banco: usuário desativado ou senha trocada invalida tokens antigos
    const { rows } = await db.query(
      'SELECT id, nome, email, perfil, ativo, token_version, troca_senha_obrigatoria FROM usuarios WHERE id = $1',
      [payload.sub],
    );
    const u = rows[0];
    if (!u || !u.ativo || u.token_version !== payload.tv) {
      encerrarSessao(res);
      throw new HttpError(401, 'Sessão inválida ou expirada');
    }
    if (u.troca_senha_obrigatoria && !options.permitirTrocaPendente) {
      throw new HttpError(403, 'Troca de senha obrigatória antes de continuar');
    }
    req.user = u;
    next();
  };
}

// RBAC: autorização por perfil
function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.user || !perfis.includes(req.user.perfil)) {
      throw new HttpError(403, 'Acesso negado para o seu perfil');
    }
    next();
  };
}

module.exports = { autenticar, exigirPerfil, emitirSessao, encerrarSessao, COOKIE };
