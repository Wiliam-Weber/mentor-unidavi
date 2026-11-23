'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, query, idParam } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const { SEMESTRE_REMATRICULA, PROGRAMAS_BOLSA } = require('../utils/periodo');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

router.get('/programas', (req, res) => {
  res.json({ semestre: SEMESTRE_REMATRICULA, programas: Object.entries(PROGRAMAS_BOLSA).map(([id, nome]) => ({ id, nome })) });
});

// ----- Aluno -----
router.get('/minhas', exigirPerfil('aluno'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, semestre, programa, renda_familiar, membros_familia, status, percentual, resposta, criado_em, atualizado_em
       FROM bolsas WHERE aluno_id = $1 ORDER BY criado_em DESC`,
    [req.user.id],
  );
  res.json(rows.map((r) => ({ ...r, programa_nome: PROGRAMAS_BOLSA[r.programa] })));
});

const solicitacao = z.object({
  programa: z.enum(Object.keys(PROGRAMAS_BOLSA)),
  rendaFamiliar: z.number().min(0).max(1_000_000),
  membrosFamilia: z.number().int().min(1).max(20),
  justificativa: texto(20, 3000),
}).strict();

router.post('/', exigirPerfil('aluno'), body(solicitacao), async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `INSERT INTO bolsas (aluno_id, semestre, programa, renda_familiar, membros_familia, justificativa)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, SEMESTRE_REMATRICULA, b.programa, Math.round(b.rendaFamiliar * 100) / 100, b.membrosFamilia, b.justificativa],
  );
  // LGPD: a renda não vai para o log de auditoria
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'BOLSA_SOLICITADA', entidade: 'bolsas', entidadeId: rows[0].id, dados: { programa: b.programa }, ip: req.ip });
  res.status(201).json({ id: rows[0].id, mensagem: 'Solicitação enviada' });
});

// ----- Secretaria -----
const filtro = z.object({ status: z.enum(['enviada', 'em_analise', 'deferida', 'indeferida']).optional() });

router.get('/', exigirPerfil('secretaria'), query(filtro), async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.id, b.semestre, b.programa, b.renda_familiar, b.membros_familia,
            round(b.renda_familiar / b.membros_familia, 2) AS renda_per_capita,
            b.justificativa, b.status, b.percentual, b.resposta, b.criado_em, u.nome AS aluno, a.matricula
       FROM bolsas b JOIN usuarios u ON u.id = b.aluno_id JOIN alunos a ON a.usuario_id = b.aluno_id
      WHERE ($1::status_bolsa IS NULL OR b.status = $1)
      ORDER BY renda_per_capita ASC, b.criado_em LIMIT 300`,
    [req.q.status ?? null],
  );
  res.json(rows.map((r) => ({ ...r, programa_nome: PROGRAMAS_BOLSA[r.programa] })));
});

const analise = z.object({
  status: z.enum(['em_analise', 'deferida', 'indeferida']),
  percentual: z.number().min(1).max(100).optional(),
  resposta: texto(3, 2000).optional(),
}).strict()
  .refine((d) => d.status !== 'deferida' || d.percentual, { message: 'Informe o percentual da bolsa', path: ['percentual'] })
  .refine((d) => d.status === 'em_analise' || d.resposta, { message: 'Informe a resposta ao aluno', path: ['resposta'] });

router.patch('/:id', exigirPerfil('secretaria'), params(idParam), body(analise), async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `UPDATE bolsas SET status = $2, percentual = $3, resposta = COALESCE($4, resposta), analisado_por = $5, atualizado_em = now()
      WHERE id = $1 AND status IN ('enviada', 'em_analise') RETURNING id`,
    [req.p.id, b.status, b.status === 'deferida' ? b.percentual : null, b.resposta ?? null, req.user.id],
  );
  if (!rows[0]) throw new HttpError(409, 'Solicitação não encontrada ou já finalizada');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'BOLSA_ANALISADA', entidade: 'bolsas', entidadeId: req.p.id, dados: { status: b.status, percentual: b.percentual }, ip: req.ip });
  res.json({ mensagem: 'Solicitação atualizada' });
});

module.exports = router;
