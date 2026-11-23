'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const { urlSegura } = require('./materiais');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT id, titulo, url FROM links_uteis ORDER BY ordem, titulo');
  res.json(rows);
});

router.post('/', exigirPerfil('secretaria'), body(z.object({ titulo: texto(2, 60), url: urlSegura, ordem: z.number().int().min(0).max(999).optional() }).strict()), async (req, res) => {
  const { rows } = await db.query(
    'INSERT INTO links_uteis (titulo, url, ordem) VALUES ($1, $2, $3) RETURNING id',
    [req.body.titulo, req.body.url, req.body.ordem ?? 0],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'LINK_CRIADO', entidade: 'links_uteis', entidadeId: rows[0].id, dados: { url: req.body.url }, ip: req.ip });
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirPerfil('secretaria'), params(idParam), async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM links_uteis WHERE id = $1', [req.p.id]);
  if (!rowCount) throw new HttpError(404, 'Link não encontrado');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'LINK_REMOVIDO', entidade: 'links_uteis', entidadeId: req.p.id, ip: req.ip });
  res.status(204).end();
});

module.exports = router;
