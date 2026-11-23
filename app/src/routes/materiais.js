'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam, uuid } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

// Só links https (evita javascript:, data: e http sem criptografia)
const urlSegura = z.string().trim().max(500).url('Link inválido')
  .refine((u) => u.startsWith('https://'), 'O link precisa começar com https://');

router.get('/', exigirPerfil('aluno', 'professor'), async (req, res) => {
  const filtro = req.user.perfil === 'aluno'
    ? 't.id IN (SELECT turma_id FROM turma_alunos WHERE aluno_id = $1)'
    : 't.professor_id = $1';
  const { rows } = await db.query(
    `SELECT m.id, m.titulo, m.descricao, m.url, m.criado_em, t.id AS turma_id, d.nome AS disciplina, u.nome AS professor
       FROM materiais m JOIN turmas t ON t.id = m.turma_id JOIN disciplinas d ON d.id = t.disciplina_id
       JOIN usuarios u ON u.id = m.professor_id
      WHERE ${filtro} ORDER BY d.nome, m.criado_em DESC`,
    [req.user.id],
  );
  res.json(rows);
});

const materialSchema = z.object({
  turmaId: uuid,
  titulo: texto(3, 120),
  descricao: texto(0, 2000).optional(),
  url: urlSegura.optional(),
}).strict();

router.post('/', exigirPerfil('professor'), body(materialSchema), async (req, res) => {
  const b = req.body;
  const t = await db.query('SELECT 1 FROM turmas WHERE id = $1 AND professor_id = $2', [b.turmaId, req.user.id]);
  if (!t.rowCount) throw new HttpError(404, 'Turma não encontrada');
  const { rows } = await db.query(
    'INSERT INTO materiais (turma_id, professor_id, titulo, descricao, url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [b.turmaId, req.user.id, b.titulo, b.descricao || null, b.url || null],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'MATERIAL_PUBLICADO', entidade: 'materiais', entidadeId: rows[0].id, ip: req.ip });
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirPerfil('professor'), params(idParam), async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM materiais WHERE id = $1 AND professor_id = $2', [req.p.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Material não encontrado');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'MATERIAL_REMOVIDO', entidade: 'materiais', entidadeId: req.p.id, ip: req.ip });
  res.status(204).end();
});

module.exports = { router, urlSegura };
