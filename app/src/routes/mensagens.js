'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam, uuid } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

// Condição de "esta mensagem é para mim", conforme o perfil
const PARA_MIM = `(
  m.destinatario_id = $1
  OR ($2 = 'aluno' AND m.para_todos_alunos)
  OR ($2 = 'aluno' AND m.turma_id IN (SELECT turma_id FROM turma_alunos WHERE aluno_id = $1))
  OR ($2 = 'secretaria' AND m.para_secretaria)
)`;

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.id, m.assunto, m.corpo, m.criado_em, u.nome AS remetente, u.perfil AS perfil_remetente,
            d.nome AS disciplina, (l.mensagem_id IS NOT NULL) AS lida
       FROM mensagens m
       JOIN usuarios u ON u.id = m.remetente_id
       LEFT JOIN turmas t ON t.id = m.turma_id
       LEFT JOIN disciplinas d ON d.id = t.disciplina_id
       LEFT JOIN mensagens_leituras l ON l.mensagem_id = m.id AND l.usuario_id = $1
      WHERE ${PARA_MIM}
      ORDER BY m.criado_em DESC LIMIT 100`,
    [req.user.id, req.user.perfil],
  );
  res.json(rows);
});

router.get('/nao-lidas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT count(*)::int AS qtd FROM mensagens m
      WHERE ${PARA_MIM}
        AND NOT EXISTS (SELECT 1 FROM mensagens_leituras l WHERE l.mensagem_id = m.id AND l.usuario_id = $1)`,
    [req.user.id, req.user.perfil],
  );
  res.json(rows[0]);
});

router.get('/enviadas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.id, m.assunto, m.corpo, m.criado_em,
            COALESCE(u.nome, d.nome, CASE WHEN m.para_todos_alunos THEN 'Todos os alunos' ELSE 'Secretaria' END) AS para
       FROM mensagens m
       LEFT JOIN usuarios u ON u.id = m.destinatario_id
       LEFT JOIN turmas t ON t.id = m.turma_id
       LEFT JOIN disciplinas d ON d.id = t.disciplina_id
      WHERE m.remetente_id = $1 ORDER BY m.criado_em DESC LIMIT 100`,
    [req.user.id],
  );
  res.json(rows);
});

router.post('/:id/lida', params(idParam), async (req, res) => {
  // Só marca como lida se a mensagem realmente for para o usuário (controle por objeto)
  const { rowCount } = await db.query(
    `INSERT INTO mensagens_leituras (mensagem_id, usuario_id)
     SELECT m.id, $1 FROM mensagens m WHERE m.id = $3 AND ${PARA_MIM}
     ON CONFLICT DO NOTHING`,
    [req.user.id, req.user.perfil, req.p.id],
  );
  if (!rowCount) {
    const existe = await db.query(`SELECT 1 FROM mensagens m WHERE m.id = $3 AND ${PARA_MIM}`, [req.user.id, req.user.perfil, req.p.id]);
    if (!existe.rowCount) throw new HttpError(404, 'Mensagem não encontrada');
  }
  res.status(204).end();
});

const limiteEnvio = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { erro: 'Limite de envio de mensagens atingido. Tente mais tarde.' } });

const envioSchema = z.object({
  destino: z.enum(['secretaria', 'turma', 'aluno', 'todos_alunos']),
  turmaId: uuid.optional(),
  alunoId: uuid.optional(),
  assunto: texto(3, 120),
  corpo: texto(1, 4000),
}).strict();

// Quem pode mandar para onde (RBAC do envio)
const PERMITIDO = {
  aluno: ['secretaria'],
  professor: ['secretaria', 'turma'],
  secretaria: ['aluno', 'todos_alunos'],
};

router.post('/', limiteEnvio, body(envioSchema), async (req, res) => {
  const b = req.body;
  if (!PERMITIDO[req.user.perfil].includes(b.destino)) throw new HttpError(403, 'Destino não permitido para o seu perfil');
  let campos = { destinatario_id: null, turma_id: null, para_todos_alunos: false, para_secretaria: false };
  if (b.destino === 'secretaria') campos.para_secretaria = true;
  if (b.destino === 'todos_alunos') campos.para_todos_alunos = true;
  if (b.destino === 'turma') {
    if (!b.turmaId) throw new HttpError(400, 'Informe a turma');
    const t = await db.query('SELECT 1 FROM turmas WHERE id = $1 AND professor_id = $2', [b.turmaId, req.user.id]);
    if (!t.rowCount) throw new HttpError(404, 'Turma não encontrada');
    campos.turma_id = b.turmaId;
  }
  if (b.destino === 'aluno') {
    if (!b.alunoId) throw new HttpError(400, 'Informe o aluno');
    const a = await db.query('SELECT 1 FROM alunos WHERE usuario_id = $1', [b.alunoId]);
    if (!a.rowCount) throw new HttpError(404, 'Aluno não encontrado');
    campos.destinatario_id = b.alunoId;
  }
  const { rows } = await db.query(
    `INSERT INTO mensagens (remetente_id, destinatario_id, turma_id, para_todos_alunos, para_secretaria, assunto, corpo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [req.user.id, campos.destinatario_id, campos.turma_id, campos.para_todos_alunos, campos.para_secretaria, b.assunto, b.corpo],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'MENSAGEM_ENVIADA', entidade: 'mensagens', entidadeId: rows[0].id, dados: { destino: b.destino }, ip: req.ip });
  res.status(201).json({ id: rows[0].id, mensagem: 'Mensagem enviada' });
});

module.exports = router;
