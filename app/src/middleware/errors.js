'use strict';
const { ZodError } = require('zod');

class HttpError extends Error {
  constructor(status, message, detalhes) {
    super(message);
    this.status = status;
    this.detalhes = detalhes;
  }
}

function notFound(req, res, next) {
  next(new HttpError(404, 'Recurso não encontrado'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados inválidos',
      detalhes: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição muito grande' });
  if (err instanceof HttpError) {
    const corpo = { erro: err.message };
    if (err.detalhes) corpo.detalhes = err.detalhes;
    return res.status(err.status).json(corpo);
  }
  // Erros do PostgreSQL: nunca expor detalhes internos ao cliente
  if (err.code === '23505') return res.status(409).json({ erro: 'Registro já existe (valor duplicado)' });
  if (err.code === '23503') return res.status(400).json({ erro: 'Referência inválida' });
  if (err.code === '23514') return res.status(400).json({ erro: 'Valor fora das regras permitidas' });

  (req.log || console).error({ err }, 'erro não tratado');
  return res.status(500).json({ erro: 'Erro interno. Tente novamente mais tarde.' });
}

module.exports = { HttpError, notFound, errorHandler };
