'use strict';
const { z } = require('zod');

// Validação de entrada com allowlist (.strict() nos schemas impede mass assignment)
const body = (schema) => (req, res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};
const params = (schema) => (req, res, next) => {
  req.p = schema.parse(req.params);
  next();
};
const query = (schema) => (req, res, next) => {
  req.q = schema.parse(req.query);
  next();
};

const uuid = z.string().uuid('Identificador inválido');
const idParam = z.object({ id: uuid });
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data inválida');

module.exports = { body, params, query, uuid, idParam, dataISO };
