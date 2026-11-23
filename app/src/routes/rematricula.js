'use strict';
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, uuid } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { SEMESTRE_REMATRICULA } = require('../utils/periodo');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar());

const VERSAO_CONTRATO = '2027.1';
const MAX_DISCIPLINAS = 8;

function textoContrato(aluno, semestre) {
  return [
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS – GRADUAÇÃO',
    `Versão ${VERSAO_CONTRATO} · Semestre ${semestre}`,
    '',
    `CONTRATANTE: ${aluno.nome}, matrícula ${aluno.matricula}, aluno(a) do curso de ${aluno.curso}.`,
    'CONTRATADA: Centro Universitário para o Desenvolvimento do Alto Vale do Itajaí – UNIDAVI.',
    '',
    'Cláusula 1ª – A CONTRATADA prestará os serviços educacionais das disciplinas em que o CONTRATANTE se matricular no semestre indicado, conforme o projeto pedagógico do curso.',
    'Cláusula 2ª – O valor da semestralidade será pago em parcelas mensais, com vencimento no dia 10 de cada mês. O atraso implica multa de 2% e juros de 1% ao mês.',
    'Cláusula 3ª – A rematrícula só é efetivada se não houver parcelas vencidas em aberto.',
    'Cláusula 4ª – O trancamento ou cancelamento deve ser solicitado por requerimento no portal Mentor.',
    'Cláusula 5ª – Os dados pessoais do CONTRATANTE são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), apenas para as finalidades acadêmicas e financeiras deste contrato.',
    'Cláusula 6ª – O aceite eletrônico no portal tem a mesma validade da assinatura. O sistema registra data, hora, endereço IP e o resumo criptográfico (SHA-256) deste texto.',
  ].join('\n');
}

const hash = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

async function dadosAluno(id) {
  const { rows } = await db.query(
    'SELECT u.nome, a.matricula, a.curso FROM usuarios u JOIN alunos a ON a.usuario_id = u.id WHERE u.id = $1', [id],
  );
  if (!rows[0]) throw new HttpError(404, 'Aluno não encontrado');
  return rows[0];
}

router.get('/', exigirPerfil('aluno'), async (req, res) => {
  const aluno = await dadosAluno(req.user.id);
  const [ofertas, feita, pendencias] = await Promise.all([
    db.query(
      `SELECT t.id, d.codigo, d.nome AS disciplina, d.carga_horaria, u.nome AS professor, t.dia_semana,
              to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(t.hora_fim, 'HH24:MI') AS hora_fim
         FROM turmas t JOIN disciplinas d ON d.id = t.disciplina_id JOIN usuarios u ON u.id = t.professor_id
        WHERE t.semestre = $1 ORDER BY t.dia_semana, t.hora_inicio`,
      [SEMESTRE_REMATRICULA],
    ),
    db.query('SELECT turmas, confirmada_em FROM rematriculas WHERE aluno_id = $1 AND semestre = $2', [req.user.id, SEMESTRE_REMATRICULA]),
    db.query(
      "SELECT count(*)::int AS qtd FROM parcelas WHERE aluno_id = $1 AND status = 'aberta' AND vencimento < current_date",
      [req.user.id],
    ),
  ]);
  const contrato = textoContrato(aluno, SEMESTRE_REMATRICULA);
  res.json({
    semestre: SEMESTRE_REMATRICULA,
    ofertas: ofertas.rows,
    rematricula: feita.rows[0] || null,
    parcelasVencidas: pendencias.rows[0].qtd,
    contrato: { versao: VERSAO_CONTRATO, texto: contrato, hash: hash(contrato) },
    maxDisciplinas: MAX_DISCIPLINAS,
  });
});

const confirmacao = z.object({
  turmas: z.array(uuid).min(1).max(MAX_DISCIPLINAS),
  aceiteContrato: z.literal(true, { error: 'É preciso aceitar o contrato' }),
  hashContrato: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

router.post('/', exigirPerfil('aluno'), body(confirmacao), async (req, res) => {
  const b = req.body;
  if (new Set(b.turmas).size !== b.turmas.length) throw new HttpError(400, 'Turma repetida');
  const aluno = await dadosAluno(req.user.id);
  const contrato = textoContrato(aluno, SEMESTRE_REMATRICULA);
  // O aluno aceitou exatamente este texto? (se o contrato mudou no meio do caminho, o aceite não vale)
  if (b.hashContrato !== hash(contrato)) throw new HttpError(409, 'O contrato foi atualizado. Recarregue a página e leia a nova versão.');

  await db.transaction(async (client) => {
    const vencidas = await client.query(
      "SELECT count(*)::int AS qtd FROM parcelas WHERE aluno_id = $1 AND status = 'aberta' AND vencimento < current_date",
      [req.user.id],
    );
    if (vencidas.rows[0].qtd > 0) throw new HttpError(409, 'Há parcelas vencidas. Regularize o financeiro para rematricular.');

    const turmas = await client.query(
      'SELECT id, dia_semana, hora_inicio, hora_fim FROM turmas WHERE id = ANY($1::uuid[]) AND semestre = $2',
      [b.turmas, SEMESTRE_REMATRICULA],
    );
    if (turmas.rowCount !== b.turmas.length) throw new HttpError(400, 'Há turmas que não são oferecidas neste semestre');
    // Choque de horário
    const t = turmas.rows;
    for (let i = 0; i < t.length; i += 1) {
      for (let j = i + 1; j < t.length; j += 1) {
        if (t[i].dia_semana === t[j].dia_semana && t[i].hora_inicio < t[j].hora_fim && t[j].hora_inicio < t[i].hora_fim) {
          throw new HttpError(400, 'Duas disciplinas escolhidas têm choque de horário');
        }
      }
    }

    const ins = await client.query(
      'INSERT INTO rematriculas (aluno_id, semestre, turmas) VALUES ($1, $2, $3::uuid[]) ON CONFLICT DO NOTHING',
      [req.user.id, SEMESTRE_REMATRICULA, b.turmas],
    );
    if (!ins.rowCount) throw new HttpError(409, 'Rematrícula já confirmada para este semestre');
    await client.query(
      'INSERT INTO contratos_aceites (aluno_id, semestre, versao, hash_documento, ip) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, SEMESTRE_REMATRICULA, VERSAO_CONTRATO, hash(contrato), req.ip],
    );
    await client.query(
      'INSERT INTO turma_alunos (turma_id, aluno_id) SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING',
      [b.turmas, req.user.id],
    );
    await auditoria.registrar(client, { usuarioId: req.user.id, acao: 'REMATRICULA_CONFIRMADA', entidade: 'rematriculas', entidadeId: req.user.id, dados: { semestre: SEMESTRE_REMATRICULA, turmas: b.turmas.length }, ip: req.ip });
  });
  res.status(201).json({ mensagem: `Rematrícula ${SEMESTRE_REMATRICULA} confirmada` });
});

// Contratos aceitos (consulta) - o texto é regenerado e o hash conferido com o registrado
router.get('/contratos', exigirPerfil('aluno'), async (req, res) => {
  const aluno = await dadosAluno(req.user.id);
  const { rows } = await db.query(
    'SELECT semestre, versao, hash_documento, aceito_em, ip FROM contratos_aceites WHERE aluno_id = $1 ORDER BY aceito_em DESC',
    [req.user.id],
  );
  res.json(rows.map((r) => {
    const texto = textoContrato(aluno, r.semestre);
    return {
      semestre: r.semestre, versao: r.versao, aceitoEm: r.aceito_em, hash: r.hash_documento,
      ip: r.ip ? r.ip.replace(/\d+$/, '***') : null, // IP parcialmente mascarado
      integro: hash(texto) === r.hash_documento,
      texto,
    };
  }));
});

router.get('/secretaria', exigirPerfil('secretaria'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.nome, a.matricula, r.semestre, cardinality(r.turmas) AS disciplinas, r.confirmada_em
       FROM rematriculas r JOIN usuarios u ON u.id = r.aluno_id JOIN alunos a ON a.usuario_id = r.aluno_id
      WHERE r.semestre = $1 ORDER BY r.confirmada_em DESC`,
    [SEMESTRE_REMATRICULA],
  );
  const total = await db.query("SELECT count(*)::int AS n FROM usuarios WHERE perfil = 'aluno' AND ativo");
  res.json({ semestre: SEMESTRE_REMATRICULA, totalAlunos: total.rows[0].n, rematriculas: rows });
});

module.exports = router;
