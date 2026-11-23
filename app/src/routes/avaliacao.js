'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const { SEMESTRE_ATUAL, PERGUNTAS_AVALIACAO } = require('../utils/periodo');

const router = express.Router();
router.use(autenticar());

const MINIMO_RESPOSTAS_PARA_EXIBIR = 3; // abaixo disso o resultado poderia identificar quem respondeu

router.get('/pendentes', exigirPerfil('aluno'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id AS turma_id, d.nome AS disciplina, u.nome AS professor,
            EXISTS (SELECT 1 FROM avaliacao_participacoes p WHERE p.aluno_id = $1 AND p.turma_id = t.id) AS respondida
       FROM turma_alunos ta JOIN turmas t ON t.id = ta.turma_id JOIN disciplinas d ON d.id = t.disciplina_id
       JOIN usuarios u ON u.id = t.professor_id
      WHERE ta.aluno_id = $1 AND t.semestre = $2 ORDER BY d.nome`,
    [req.user.id, SEMESTRE_ATUAL],
  );
  res.json({ perguntas: PERGUNTAS_AVALIACAO, turmas: rows });
});

const respostas = z.object({
  notas: z.array(z.number().int().min(1).max(5)).length(PERGUNTAS_AVALIACAO.length),
  comentario: texto(0, 1000).optional(),
}).strict();

router.post('/turmas/:id', exigirPerfil('aluno'), params(idParam), body(respostas), async (req, res) => {
  await db.transaction(async (client) => {
    const ok = await client.query(
      `SELECT 1 FROM turma_alunos ta JOIN turmas t ON t.id = ta.turma_id
        WHERE ta.aluno_id = $1 AND ta.turma_id = $2 AND t.semestre = $3`,
      [req.user.id, req.p.id, SEMESTRE_ATUAL],
    );
    if (!ok.rowCount) throw new HttpError(404, 'Turma não encontrada');
    // Registra QUE respondeu (impede responder duas vezes)...
    const p = await client.query('INSERT INTO avaliacao_participacoes (aluno_id, turma_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, req.p.id]);
    if (!p.rowCount) throw new HttpError(409, 'Você já avaliou esta disciplina');
    // ...e O QUE respondeu, sem nenhuma ligação com o aluno (anonimato)
    await client.query(
      `INSERT INTO avaliacao_respostas (turma_id, pergunta, nota, comentario)
       SELECT $1, n.pergunta, n.nota, CASE WHEN n.pergunta = 1 THEN $3 END
         FROM unnest($2::smallint[]) WITH ORDINALITY AS n(nota, pergunta)`,
      [req.p.id, req.body.notas, req.body.comentario || null],
    );
  });
  // De propósito NÃO há registro de auditoria com o aluno aqui: preservaria a ligação aluno x resposta
  res.status(201).json({ mensagem: 'Avaliação enviada. Obrigado!' });
});

router.get('/resultados', exigirPerfil('secretaria'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id AS turma_id, d.nome AS disciplina, u.nome AS professor, r.pergunta,
            round(avg(r.nota), 2)::float AS media, count(*)::int AS respostas
       FROM avaliacao_respostas r JOIN turmas t ON t.id = r.turma_id JOIN disciplinas d ON d.id = t.disciplina_id
       JOIN usuarios u ON u.id = t.professor_id
      WHERE t.semestre = $1
      GROUP BY t.id, d.nome, u.nome, r.pergunta ORDER BY d.nome, r.pergunta`,
    [SEMESTRE_ATUAL],
  );
  const comentarios = await db.query(
    `SELECT r.turma_id, r.comentario FROM avaliacao_respostas r JOIN turmas t ON t.id = r.turma_id
      WHERE t.semestre = $1 AND r.comentario IS NOT NULL ORDER BY random()`,
    [SEMESTRE_ATUAL],
  );
  const turmas = new Map();
  for (const r of rows) {
    if (!turmas.has(r.turma_id)) turmas.set(r.turma_id, { turmaId: r.turma_id, disciplina: r.disciplina, professor: r.professor, respostas: r.respostas, medias: [] });
    turmas.get(r.turma_id).medias.push(r.media);
  }
  const resultado = [...turmas.values()].map((t) => (t.respostas < MINIMO_RESPOSTAS_PARA_EXIBIR
    ? { ...t, medias: null, comentarios: [], oculto: true }
    : { ...t, comentarios: comentarios.rows.filter((c) => c.turma_id === t.turmaId).map((c) => c.comentario) }));
  res.json({ perguntas: PERGUNTAS_AVALIACAO, minimo: MINIMO_RESPOSTAS_PARA_EXIBIR, turmas: resultado });
});

module.exports = router;
