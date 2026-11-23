'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const { DOCUMENTOS_OBRIGATORIOS } = require('../utils/periodo');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

async function listar(alunoId) {
  const { rows } = await db.query(
    'SELECT tipo, status, observacao, atualizado_em FROM documentos_aluno WHERE aluno_id = $1',
    [alunoId],
  );
  const mapa = new Map(rows.map((r) => [r.tipo, r]));
  // Documento sem registro conta como pendente
  return DOCUMENTOS_OBRIGATORIOS.map((tipo) => mapa.get(tipo) || { tipo, status: 'pendente', observacao: null, atualizado_em: null });
}

router.get('/meus', exigirPerfil('aluno'), async (req, res) => res.json(await listar(req.user.id)));

router.get('/aluno/:id', exigirPerfil('secretaria'), params(idParam), async (req, res) => {
  const a = await db.query('SELECT 1 FROM alunos WHERE usuario_id = $1', [req.p.id]);
  if (!a.rowCount) throw new HttpError(404, 'Aluno não encontrado');
  res.json(await listar(req.p.id));
});

const atualizacao = z.object({
  tipo: z.enum(DOCUMENTOS_OBRIGATORIOS),
  status: z.enum(['pendente', 'entregue', 'aprovado', 'recusado']),
  observacao: texto(0, 500).optional(),
}).strict().refine((d) => d.status !== 'recusado' || d.observacao, { message: 'Informe o motivo da recusa', path: ['observacao'] });

router.put('/aluno/:id', exigirPerfil('secretaria'), params(idParam), body(atualizacao), async (req, res) => {
  const b = req.body;
  const a = await db.query('SELECT 1 FROM alunos WHERE usuario_id = $1', [req.p.id]);
  if (!a.rowCount) throw new HttpError(404, 'Aluno não encontrado');
  await db.query(
    `INSERT INTO documentos_aluno (aluno_id, tipo, status, observacao) VALUES ($1, $2, $3, $4)
     ON CONFLICT (aluno_id, tipo) DO UPDATE SET status = EXCLUDED.status, observacao = EXCLUDED.observacao, atualizado_em = now()`,
    [req.p.id, b.tipo, b.status, b.observacao || null],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'DOCUMENTO_ATUALIZADO', entidade: 'documentos_aluno', entidadeId: req.p.id, dados: { tipo: b.tipo, status: b.status }, ip: req.ip });
  res.json({ mensagem: 'Documento atualizado' });
});

module.exports = router;
