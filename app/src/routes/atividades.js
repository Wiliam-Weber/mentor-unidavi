'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, query, idParam, dataISO } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const { HORAS_COMPLEMENTARES_EXIGIDAS } = require('../utils/periodo');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

const CATEGORIAS = ['ensino', 'pesquisa', 'extensao', 'cultural', 'profissional'];

router.get('/minhas', exigirPerfil('aluno'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, titulo, categoria, horas, data, descricao, status, horas_aprovadas, parecer, criado_em
       FROM atividades_complementares WHERE aluno_id = $1 ORDER BY data DESC`,
    [req.user.id],
  );
  const aprovadas = rows.reduce((s, r) => s + (r.status === 'aprovada' ? r.horas_aprovadas : 0), 0);
  const certificados = await db.query(
    `SELECT COALESCE(sum(e.carga_horaria), 0)::int AS horas FROM eventos_inscricoes i JOIN eventos e ON e.id = i.evento_id
      WHERE i.aluno_id = $1 AND i.presente`,
    [req.user.id],
  );
  const total = aprovadas + certificados.rows[0].horas;
  res.json({ exigidas: HORAS_COMPLEMENTARES_EXIGIDAS, aprovadas, eventos: certificados.rows[0].horas, total, atividades: rows });
});

const novaAtividade = z.object({
  titulo: texto(3, 160),
  categoria: z.enum(CATEGORIAS),
  horas: z.number().int().min(1).max(200),
  data: dataISO.refine((d) => new Date(`${d}T00:00:00`) <= new Date(), 'A data não pode ser futura'),
  descricao: texto(0, 2000).optional(),
}).strict();

router.post('/', exigirPerfil('aluno'), body(novaAtividade), async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `INSERT INTO atividades_complementares (aluno_id, titulo, categoria, horas, data, descricao)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, b.titulo, b.categoria, b.horas, b.data, b.descricao || null],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'ATIVIDADE_ENVIADA', entidade: 'atividades_complementares', entidadeId: rows[0].id, ip: req.ip });
  res.status(201).json({ id: rows[0].id, mensagem: 'Atividade enviada para validação' });
});

router.get('/', exigirPerfil('secretaria'), query(z.object({ status: z.enum(['enviada', 'aprovada', 'reprovada']).optional() })), async (req, res) => {
  const { rows } = await db.query(
    `SELECT at.id, at.titulo, at.categoria, at.horas, at.data, at.descricao, at.status, at.horas_aprovadas, at.parecer,
            u.nome AS aluno, a.matricula
       FROM atividades_complementares at JOIN usuarios u ON u.id = at.aluno_id JOIN alunos a ON a.usuario_id = at.aluno_id
      WHERE ($1::text IS NULL OR at.status = $1) ORDER BY at.criado_em LIMIT 300`,
    [req.q.status ?? null],
  );
  res.json(rows);
});

const avaliacao = z.object({
  status: z.enum(['aprovada', 'reprovada']),
  horasAprovadas: z.number().int().min(0).max(200).optional(),
  parecer: texto(3, 1000).optional(),
}).strict().refine((d) => d.status !== 'reprovada' || d.parecer, { message: 'Explique o motivo da reprovação', path: ['parecer'] });

router.patch('/:id', exigirPerfil('secretaria'), params(idParam), body(avaliacao), async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `UPDATE atividades_complementares
        SET status = $2, horas_aprovadas = CASE WHEN $2 = 'aprovada' THEN LEAST(COALESCE($3, horas), horas) ELSE 0 END,
            parecer = $4, avaliado_por = $5
      WHERE id = $1 AND status = 'enviada' RETURNING horas_aprovadas`,
    [req.p.id, b.status, b.horasAprovadas ?? null, b.parecer ?? null, req.user.id],
  );
  if (!rows[0]) throw new HttpError(409, 'Atividade não encontrada ou já avaliada');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'ATIVIDADE_AVALIADA', entidade: 'atividades_complementares', entidadeId: req.p.id, dados: { status: b.status, horas: rows[0].horas_aprovadas }, ip: req.ip });
  res.json({ mensagem: 'Atividade avaliada' });
});

module.exports = router;
