'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam, uuid, dataISO } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar(), exigirPerfil('professor'));

// Controle de acesso por objeto: o professor só acessa turmas que leciona.
// Retorna 404 (e não 403) para não revelar a existência de turmas de outros professores.
async function garantirTurmaDoProfessor(conn, turmaId, professorId) {
  const { rowCount } = await conn.query('SELECT 1 FROM turmas WHERE id = $1 AND professor_id = $2', [turmaId, professorId]);
  if (!rowCount) throw new HttpError(404, 'Turma não encontrada');
}

async function garantirAlunosDaTurma(conn, turmaId, alunoIds) {
  const unicos = [...new Set(alunoIds)];
  if (unicos.length !== alunoIds.length) throw new HttpError(400, 'Aluno repetido na lista');
  const { rows } = await conn.query(
    'SELECT count(*)::int AS qtd FROM turma_alunos WHERE turma_id = $1 AND aluno_id = ANY($2::uuid[])',
    [turmaId, unicos],
  );
  if (rows[0].qtd !== unicos.length) throw new HttpError(400, 'Há alunos que não pertencem a esta turma');
}

router.get('/turmas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, d.id AS disciplina_id, d.codigo, d.nome AS disciplina, t.semestre, t.dia_semana,
            to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(t.hora_fim, 'HH24:MI') AS hora_fim, t.sala,
            (SELECT count(*)::int FROM turma_alunos ta WHERE ta.turma_id = t.id) AS qtd_alunos
       FROM turmas t JOIN disciplinas d ON d.id = t.disciplina_id
      WHERE t.professor_id = $1
      ORDER BY t.dia_semana, t.hora_inicio`,
    [req.user.id],
  );
  res.json(rows);
});

router.get('/turmas/:id/alunos', params(idParam), async (req, res) => {
  await garantirTurmaDoProfessor(db, req.p.id, req.user.id);
  const { rows } = await db.query(
    `SELECT u.id, u.nome, a.matricula
       FROM turma_alunos ta JOIN usuarios u ON u.id = ta.aluno_id JOIN alunos a ON a.usuario_id = u.id
      WHERE ta.turma_id = $1 ORDER BY u.nome`,
    [req.p.id],
  );
  res.json(rows);
});

router.get('/turmas/:id/notas', params(idParam), async (req, res) => {
  await garantirTurmaDoProfessor(db, req.p.id, req.user.id);
  const { rows } = await db.query(
    `SELECT n.aluno_id, u.nome, n.avaliacao, n.peso, n.nota, n.atualizado_em
       FROM notas n JOIN usuarios u ON u.id = n.aluno_id
      WHERE n.turma_id = $1 ORDER BY n.avaliacao, u.nome`,
    [req.p.id],
  );
  res.json(rows);
});

const notasSchema = z.object({
  avaliacao: texto(1, 60),
  peso: z.number().min(0.1).max(10),
  notas: z.array(z.object({
    alunoId: uuid,
    nota: z.number().min(0, 'Nota mínima é 0').max(10, 'Nota máxima é 10'),
  }).strict()).min(1).max(200),
}).strict();

router.put('/turmas/:id/notas', params(idParam), body(notasSchema), async (req, res) => {
  const { avaliacao, peso, notas } = req.body;
  await db.transaction(async (client) => {
    await garantirTurmaDoProfessor(client, req.p.id, req.user.id);
    await garantirAlunosDaTurma(client, req.p.id, notas.map((n) => n.alunoId));

    const anteriores = await client.query(
      'SELECT aluno_id, nota FROM notas WHERE turma_id = $1 AND avaliacao = $2',
      [req.p.id, avaliacao],
    );
    const mapaAnterior = new Map(anteriores.rows.map((r) => [r.aluno_id, Number(r.nota)]));

    for (const n of notas) {
      await client.query(
        `INSERT INTO notas (turma_id, aluno_id, avaliacao, peso, nota, lancado_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (turma_id, aluno_id, avaliacao)
         DO UPDATE SET nota = EXCLUDED.nota, peso = EXCLUDED.peso, lancado_por = EXCLUDED.lancado_por, atualizado_em = now()`,
        [req.p.id, n.alunoId, avaliacao, peso, Math.round(n.nota * 100) / 100, req.user.id],
      );
    }
    // Auditoria com valor anterior e novo (integridade das notas)
    await auditoria.registrar(client, {
      usuarioId: req.user.id,
      acao: 'NOTAS_LANCADAS',
      entidade: 'turmas',
      entidadeId: req.p.id,
      dados: {
        avaliacao,
        peso,
        alteracoes: notas.map((n) => ({ alunoId: n.alunoId, anterior: mapaAnterior.get(n.alunoId) ?? null, nova: n.nota })),
      },
      ip: req.ip,
    });
  });
  res.json({ mensagem: 'Notas salvas' });
});

router.get('/turmas/:id/aulas', params(idParam), async (req, res) => {
  await garantirTurmaDoProfessor(db, req.p.id, req.user.id);
  const { rows } = await db.query(
    `SELECT a.id, a.data, a.conteudo,
            count(p.id) FILTER (WHERE p.presente)::int AS presentes,
            count(p.id) FILTER (WHERE NOT p.presente)::int AS ausentes
       FROM aulas a LEFT JOIN presencas p ON p.aula_id = a.id
      WHERE a.turma_id = $1
      GROUP BY a.id ORDER BY a.data DESC`,
    [req.p.id],
  );
  res.json(rows);
});

const aulaSchema = z.object({
  data: dataISO.refine((d) => new Date(`${d}T00:00:00`) <= new Date(), 'Não é possível registrar aula no futuro'),
  conteudo: texto(3, 500),
  presencas: z.array(z.object({ alunoId: uuid, presente: z.boolean() }).strict()).min(1).max(200),
}).strict();

router.post('/turmas/:id/aulas', params(idParam), body(aulaSchema), async (req, res) => {
  const { data, conteudo, presencas } = req.body;
  const aula = await db.transaction(async (client) => {
    await garantirTurmaDoProfessor(client, req.p.id, req.user.id);
    await garantirAlunosDaTurma(client, req.p.id, presencas.map((p) => p.alunoId));
    const { rows } = await client.query(
      'INSERT INTO aulas (turma_id, data, conteudo) VALUES ($1, $2, $3) RETURNING id',
      [req.p.id, data, conteudo],
    );
    await client.query(
      `INSERT INTO presencas (aula_id, aluno_id, presente)
       SELECT $1, x.aluno_id, x.presente FROM unnest($2::uuid[], $3::boolean[]) AS x(aluno_id, presente)`,
      [rows[0].id, presencas.map((p) => p.alunoId), presencas.map((p) => p.presente)],
    );
    await auditoria.registrar(client, {
      usuarioId: req.user.id, acao: 'CHAMADA_REGISTRADA', entidade: 'aulas', entidadeId: rows[0].id,
      dados: { turmaId: req.p.id, data, ausentes: presencas.filter((p) => !p.presente).length }, ip: req.ip,
    });
    return rows[0];
  });
  res.status(201).json(aula);
});

router.get('/turmas/:id/faltas', params(idParam), async (req, res) => {
  await garantirTurmaDoProfessor(db, req.p.id, req.user.id);
  const { rows } = await db.query(
    `SELECT p.id, a.data, u.nome, p.justificada, p.justificativa
       FROM presencas p JOIN aulas a ON a.id = p.aula_id JOIN usuarios u ON u.id = p.aluno_id
      WHERE a.turma_id = $1 AND NOT p.presente
      ORDER BY a.data DESC, u.nome`,
    [req.p.id],
  );
  res.json(rows);
});

const justificativaSchema = z.object({ justificativa: texto(5, 500) }).strict();

router.patch('/presencas/:id/justificativa', params(idParam), body(justificativaSchema), async (req, res) => {
  const { rows } = await db.query(
    `UPDATE presencas p SET justificada = true, justificativa = $3
       FROM aulas a, turmas t
      WHERE p.id = $1 AND a.id = p.aula_id AND t.id = a.turma_id AND t.professor_id = $2 AND NOT p.presente
      RETURNING p.id`,
    [req.p.id, req.user.id, req.body.justificativa],
  );
  if (!rows[0]) throw new HttpError(404, 'Falta não encontrada');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'FALTA_JUSTIFICADA', entidade: 'presencas', entidadeId: req.p.id, ip: req.ip });
  res.json({ mensagem: 'Falta justificada' });
});

router.get('/planos', async (req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT d.id, d.codigo, d.nome, d.carga_horaria, d.ementa, d.objetivos, d.conteudo_programatico,
            d.metodologia, d.avaliacao, d.bibliografia, d.plano_atualizado_em
       FROM disciplinas d JOIN turmas t ON t.disciplina_id = d.id
      WHERE t.professor_id = $1 ORDER BY d.nome`,
    [req.user.id],
  );
  res.json(rows);
});

const planoSchema = z.object({
  ementa: texto(10, 3000),
  objetivos: texto(10, 3000),
  conteudoProgramatico: texto(10, 6000),
  metodologia: texto(10, 3000),
  avaliacao: texto(10, 3000),
  bibliografia: texto(10, 3000),
}).strict();

router.put('/planos/:id', params(idParam), body(planoSchema), async (req, res) => {
  const b = req.body;
  const { rowCount } = await db.query(
    `UPDATE disciplinas d SET ementa = $3, objetivos = $4, conteudo_programatico = $5, metodologia = $6,
            avaliacao = $7, bibliografia = $8, plano_atualizado_em = now(), plano_atualizado_por = $2
      WHERE d.id = $1 AND EXISTS (SELECT 1 FROM turmas t WHERE t.disciplina_id = d.id AND t.professor_id = $2)`,
    [req.p.id, req.user.id, b.ementa, b.objetivos, b.conteudoProgramatico, b.metodologia, b.avaliacao, b.bibliografia],
  );
  if (!rowCount) throw new HttpError(404, 'Disciplina não encontrada');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'PLANO_ENSINO_ATUALIZADO', entidade: 'disciplinas', entidadeId: req.p.id, ip: req.ip });
  res.json({ mensagem: 'Plano de ensino salvo' });
});

module.exports = router;
