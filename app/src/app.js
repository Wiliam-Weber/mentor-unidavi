'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const config = require('./config');
const logger = require('./logger');
const { csrfGuard } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // atrás do ALB: IP real do cliente para rate limit e auditoria

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Cabeçalhos de segurança (CSP restritiva, HSTS, anti-clickjacking, nosniff...)
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.cookieSecure ? [] : null,
      },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  }));

  // Health check do ALB (não consulta o banco para não derrubar instâncias por oscilação do BD)
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // Limite geral folgado: muitos alunos saem pelo mesmo IP da rede do campus (NAT).
  // A proteção forte contra força bruta fica no login (10 tentativas/15 min) e no WAF.
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 2000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { erro: 'Muitas requisições. Aguarde alguns minutos.' },
  }));
  app.use('/api', csrfGuard);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/aluno', require('./routes/aluno'));
  app.use('/api/jogo', require('./routes/jogo'));
  app.use('/api/professor', require('./routes/professor'));
  app.use('/api/secretaria', require('./routes/secretaria'));
  app.use('/api/mensagens', require('./routes/mensagens'));
  app.use('/api/materiais', require('./routes/materiais').router);
  app.use('/api/bolsas', require('./routes/bolsas'));
  app.use('/api/atividades', require('./routes/atividades'));
  app.use('/api/eventos', require('./routes/eventos').router);
  app.use('/api/documentos', require('./routes/documentos'));
  app.use('/api/avaliacao', require('./routes/avaliacao'));
  app.use('/api/rematricula', require('./routes/rematricula'));
  app.use('/api/historico', require('./routes/historico'));
  app.use('/api/links', require('./routes/links'));
  app.use('/api/basquete', require('./routes/basquete'));
  app.use('/api', notFound);

  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
