'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { query } = require('../middleware/validate');
const { SEMESTRE_ATUAL } = require('../utils/periodo');
const { autenticar, exigirPerfil } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar(), exigirPerfil('aluno'));

// Histórico escolar: média ponderada, frequência e situação de cada disciplina cursada
router.get('/escolar', async (req, res) => {
  const { rows } = await db.query(
    `WITH medias AS (
       SELECT turma_id, sum(nota * peso) / NULLIF(sum(peso), 0) AS media
         FROM notas WHERE aluno_id = $1 GROUP BY turma_id
     ), freq AS (
       SELECT a.turma_id, count(*) FILTER (WHERE p.presente OR p.justificada)::float / NULLIF(count(*), 0) * 100 AS percentual
         FROM presencas p JOIN aulas a ON a.id = p.aula_id WHERE p.aluno_id = $1 GROUP BY a.turma_id
     )
     SELECT t.semestre, d.codigo, d.nome AS disciplina, d.carga_horaria,
            round(m.media, 2)::float AS media, round(f.percentual::numeric, 1)::float AS frequencia
       FROM turma_alunos ta JOIN turmas t ON t.id = ta.turma_id JOIN disciplinas d ON d.id = t.disciplina_id
       LEFT JOIN medias m ON m.turma_id = t.id LEFT JOIN freq f ON f.turma_id = t.id
      WHERE ta.aluno_id = $1 ORDER BY t.semestre, d.nome`,
    [req.user.id],
  );
  const linhas = rows.map((r) => {
    let situacao = 'Cursando';
    if (r.semestre >= SEMESTRE_ATUAL) return { ...r, situacao }; // semestre em andamento: notas parciais
    if (r.frequencia !== null && r.frequencia < 75) situacao = 'Reprovado por falta';
    else if (r.media !== null) situacao = r.media >= 7 ? 'Aprovado' : 'Reprovado';
    return { ...r, situacao };
  });
  const comNota = linhas.filter((l) => l.media !== null);
  const chTotal = comNota.reduce((s, l) => s + l.carga_horaria, 0);
  const coeficiente = chTotal ? Math.round((comNota.reduce((s, l) => s + l.media * l.carga_horaria, 0) / chTotal) * 100) / 100 : null;
  const aluno = await db.query(
    'SELECT u.nome, a.matricula, a.curso FROM usuarios u JOIN alunos a ON a.usuario_id = u.id WHERE u.id = $1', [req.user.id],
  );
  res.json({ aluno: aluno.rows[0], coeficiente, cargaHorariaCursada: chTotal, disciplinas: linhas });
});

// Informe de pagamentos para o Imposto de Renda (despesas com instrução)
router.get('/informe-pagamentos', query(z.object({ ano: z.coerce.number().int().min(2000).max(2100).optional() })), async (req, res) => {
  const ano = req.q.ano || new Date().getFullYear();
  const { rows } = await db.query(
    `SELECT numero, competencia, valor, pago_em FROM parcelas
      WHERE aluno_id = $1 AND status = 'paga' AND extract(year FROM pago_em) = $2 ORDER BY pago_em`,
    [req.user.id, ano],
  );
  const aluno = await db.query(
    'SELECT u.nome, a.matricula, a.cpf FROM usuarios u JOIN alunos a ON a.usuario_id = u.id WHERE u.id = $1', [req.user.id],
  );
  const total = rows.reduce((s, r) => s + Number(r.valor), 0);
  const cpf = aluno.rows[0].cpf;
  res.json({
    ano,
    beneficiario: { nome: aluno.rows[0].nome, matricula: aluno.rows[0].matricula, cpf: `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` },
    instituicao: { nome: 'UNIDAVI – Centro Universitário para o Desenvolvimento do Alto Vale do Itajaí' },
    total: Math.round(total * 100) / 100,
    pagamentos: rows,
  });
});

module.exports = router;
