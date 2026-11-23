'use strict';
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { createApp } = require('./app');

const server = createApp().listen(config.port, () => {
  logger.info({ porta: config.port, ambiente: config.env }, 'Mentor UNIDAVI em execução');
});
// Timeouts maiores que o idle timeout do ALB (60s) evitam erros 502 intermitentes
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Encerramento gracioso (instance refresh / scale-in do Auto Scaling)
function encerrar(sinal) {
  logger.info({ sinal }, 'encerrando');
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
