'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, uuid } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { mascararCpf, texto, telefone } = require('../utils/formatos');
const auditoria = require('../utils/auditoria');
const { SEMESTRE_ATUAL } = require('../utils/periodo');

const router = express.Router();
router.use(autenticar(), exigirPerfil('aluno'));

const MEDIA_APROVACAO = 7;
const FREQUENCIA_MINIMA = 75;

function conceito(media) {
  if (media === null) return '-';
  if (media >= 9) return 'A';
  if (media >= 7) return 'B';
  if (media >= 5) return 'C';
  return 'D';
}

// Todas as consultas filtram pelo ID do usuário autenticado (aluno só vê os próprios dados)
router.get('/horarios', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, d.codigo, d.nome AS disciplina, u.nome AS professor, t.semestre, t.dia_semana,
            to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(t.hora_fim, 'HH24:MI') AS hora_fim, t.sala
       FROM turma_alunos ta
       JOIN turmas t ON t.id = ta.turma_id
       JOIN disciplinas d ON d.id = t.disciplina_id
       JOIN usuarios u ON u.id = t.professor_id
      WHERE ta.aluno_id = $1 AND t.semestre = $2
      ORDER BY t.dia_semana, t.hora_inicio`,
    [req.user.id, SEMESTRE_ATUAL],
  );
  res.json(rows);
});

router.get('/notas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id AS turma_id, d.nome AS disciplina, n.avaliacao, n.peso, n.nota
       FROM turma_alunos ta
       JOIN turmas t ON t.id = ta.turma_id
       JOIN disciplinas d ON d.id = t.disciplina_id
       LEFT JOIN notas n ON n.turma_id = t.id AND n.aluno_id = ta.aluno_id
      WHERE ta.aluno_id = $1 AND t.semestre = $2
      ORDER BY d.nome, n.avaliacao`,
    [req.user.id, SEMESTRE_ATUAL],
  );
  const porTurma = new Map();
  for (const r of rows) {
    if (!porTurma.has(r.turma_id)) porTurma.set(r.turma_id, { turmaId: r.turma_id, disciplina: r.disciplina, avaliacoes: [] });
    if (r.avaliacao) porTurma.get(r.turma_id).avaliacoes.push({ avaliacao: r.avaliacao, peso: Number(r.peso), nota: Number(r.nota) });
  }
  const resultado = [...porTurma.values()].map((t) => {
    const somaPesos = t.avaliacoes.reduce((s, a) => s + a.peso, 0);
    const media = somaPesos ? Math.round((t.avaliacoes.reduce((s, a) => s + a.nota * a.peso, 0) / somaPesos) * 100) / 100 : null;
    let situacao = 'Sem notas lançadas';
    if (media !== null) situacao = media >= MEDIA_APROVACAO ? 'Na média' : 'Abaixo da média';
    return { ...t, media, conceito: conceito(media), situacao };
  });
  res.json(resultado);
});

router.get('/frequencia', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id AS turma_id, d.nome AS disciplina, d.carga_horaria,
            count(DISTINCT a.id)::int AS total_aulas,
            count(p.id) FILTER (WHERE p.presente)::int AS presencas,
            count(p.id) FILTER (WHERE NOT p.presente AND NOT p.justificada)::int AS faltas,
            count(p.id) FILTER (WHERE NOT p.presente AND p.justificada)::int AS faltas_justificadas
       FROM turma_alunos ta
       JOIN turmas t ON t.id = ta.turma_id
       JOIN disciplinas d ON d.id = t.disciplina_id
       LEFT JOIN aulas a ON a.turma_id = t.id
       LEFT JOIN presencas p ON p.aula_id = a.id AND p.aluno_id = ta.aluno_id
      WHERE ta.aluno_id = $1 AND t.semestre = $2
      GROUP BY t.id, d.nome, d.carga_horaria
      ORDER BY d.nome`,
    [req.user.id, SEMESTRE_ATUAL],
  );
  res.json(rows.map((r) => {
    const registradas = r.presencas + r.faltas + r.faltas_justificadas;
    const percentual = registradas ? Math.round(((r.presencas + r.faltas_justificadas) / registradas) * 1000) / 10 : 100;
    return {
      ...r,
      percentual,
      situacao: percentual >= FREQUENCIA_MINIMA ? 'Regular' : 'Risco de reprovação por falta',
    };
  }));
});

router.get('/planos', async (req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT d.id, d.codigo, d.nome, d.carga_horaria, d.ementa, d.objetivos,
            d.conteudo_programatico, d.metodologia, d.avaliacao, d.bibliografia, d.plano_atualizado_em
       FROM turma_alunos ta
       JOIN turmas t ON t.id = ta.turma_id
       JOIN disciplinas d ON d.id = t.disciplina_id
      WHERE ta.aluno_id = $1
      ORDER BY d.nome`,
    [req.user.id],
  );
  res.json(rows);
});

router.get('/parcelas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, numero, competencia, vencimento, valor, status, pago_em,
            (status = 'aberta' AND vencimento < current_date) AS vencida
       FROM parcelas WHERE aluno_id = $1 ORDER BY vencimento`,
    [req.user.id],
  );
  res.json(rows);
});

router.get('/tipos-requerimento', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, nome, descricao, prazo_dias FROM tipos_requerimento WHERE ativo ORDER BY nome',
  );
  res.json(rows);
});

router.get('/requerimentos', async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.id, tr.nome AS tipo, r.descricao, r.status, r.resposta, r.criado_em, r.atualizado_em
       FROM requerimentos r JOIN tipos_requerimento tr ON tr.id = r.tipo_id
      WHERE r.aluno_id = $1 ORDER BY r.criado_em DESC`,
    [req.user.id],
  );
  res.json(rows);
});

const novoRequerimento = z.object({
  tipoId: uuid,
  descricao: texto(10, 2000),
}).strict();

router.post('/requerimentos', body(novoRequerimento), async (req, res) => {
  const tipo = await db.query('SELECT id FROM tipos_requerimento WHERE id = $1 AND ativo', [req.body.tipoId]);
  if (!tipo.rowCount) throw new HttpError(400, 'Tipo de requerimento inválido ou inativo');
  const abertos = await db.query(
    "SELECT count(*)::int AS qtd FROM requerimentos WHERE aluno_id = $1 AND status IN ('aberto','em_analise')",
    [req.user.id],
  );
  if (abertos.rows[0].qtd >= 10) throw new HttpError(429, 'Limite de 10 requerimentos em aberto atingido');
  const { rows } = await db.query(
    `INSERT INTO requerimentos (aluno_id, tipo_id, descricao) VALUES ($1, $2, $3)
     RETURNING id, status, criado_em`,
    [req.user.id, req.body.tipoId, req.body.descricao],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'REQUERIMENTO_CRIADO', entidade: 'requerimentos', entidadeId: rows[0].id, ip: req.ip });
  res.status(201).json(rows[0]);
});

router.get('/perfil', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.nome, u.email, a.matricula, a.cpf, a.curso, a.data_nascimento, a.telefone, a.endereco
       FROM usuarios u JOIN alunos a ON a.usuario_id = u.id WHERE u.id = $1`,
    [req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Cadastro não encontrado');
  res.json({ ...rows[0], cpf: mascararCpf(rows[0].cpf) });
});

// O aluno só pode alterar dados de contato; demais campos são da secretaria
const atualizaPerfil = z.object({
  telefone: telefone.optional(),
  endereco: texto(5, 200).optional(),
}).strict().refine((d) => d.telefone !== undefined || d.endereco !== undefined, 'Informe ao menos um campo');

router.patch('/perfil', body(atualizaPerfil), async (req, res) => {
  const { telefone: tel, endereco } = req.body;
  await db.query(
    'UPDATE alunos SET telefone = COALESCE($2, telefone), endereco = COALESCE($3, endereco) WHERE usuario_id = $1',
    [req.user.id, tel ?? null, endereco ?? null],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'DADOS_CADASTRAIS_ATUALIZADOS', entidade: 'alunos', entidadeId: req.user.id, dados: { campos: Object.keys(req.body) }, ip: req.ip });
  res.json({ mensagem: 'Dados atualizados' });
});

module.exports = router;
