'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam, uuid } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar(), exigirPerfil('aluno'));

const PERGUNTAS_POR_PARTIDA = 5;
const PONTOS_POR_ACERTO = 10;
const TEMPO_LIMITE_MS = 5 * 60 * 1000;
const PARTIDAS_POR_DIA = 10;

const limiteJogo = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

// Anti-trapaça: o gabarito nunca vai para o navegador e a pontuação é calculada no servidor
router.post('/partidas', limiteJogo, async (req, res) => {
  const hoje = await db.query(
    "SELECT count(*)::int AS qtd FROM jogo_partidas WHERE aluno_id = $1 AND iniciada_em >= date_trunc('day', now())",
    [req.user.id],
  );
  if (hoje.rows[0].qtd >= PARTIDAS_POR_DIA) {
    throw new HttpError(429, `Limite de ${PARTIDAS_POR_DIA} partidas por dia atingido. Volte amanhã!`);
  }
  const perguntas = await db.query(
    'SELECT id, pergunta, alternativas FROM jogo_perguntas WHERE ativa ORDER BY random() LIMIT $1',
    [PERGUNTAS_POR_PARTIDA],
  );
  if (perguntas.rowCount === 0) throw new HttpError(503, 'Nenhuma pergunta cadastrada');
  const partida = await db.query(
    'INSERT INTO jogo_partidas (aluno_id, perguntas) VALUES ($1, $2::uuid[]) RETURNING id, iniciada_em',
    [req.user.id, perguntas.rows.map((p) => p.id)],
  );
  res.status(201).json({
    partidaId: partida.rows[0].id,
    tempoLimiteSegundos: TEMPO_LIMITE_MS / 1000,
    perguntas: perguntas.rows,
  });
});

const respostasSchema = z.object({
  respostas: z.array(z.object({
    perguntaId: uuid,
    alternativa: z.number().int().min(0).max(5),
  }).strict()).min(1).max(PERGUNTAS_POR_PARTIDA),
}).strict();

router.post('/partidas/:id/respostas', limiteJogo, params(idParam), body(respostasSchema), async (req, res) => {
  const resultado = await db.transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, perguntas, iniciada_em, finalizada_em FROM jogo_partidas WHERE id = $1 AND aluno_id = $2 FOR UPDATE',
      [req.p.id, req.user.id],
    );
    const partida = rows[0];
    if (!partida) throw new HttpError(404, 'Partida não encontrada');
    if (partida.finalizada_em) throw new HttpError(409, 'Esta partida já foi finalizada');

    if (Date.now() - new Date(partida.iniciada_em).getTime() > TEMPO_LIMITE_MS) {
      await client.query('UPDATE jogo_partidas SET finalizada_em = now(), pontuacao = 0, acertos = 0 WHERE id = $1', [partida.id]);
      throw new HttpError(400, 'Tempo esgotado: a partida foi encerrada sem pontos');
    }

    const permitidas = new Set(partida.perguntas);
    const ids = req.body.respostas.map((r) => r.perguntaId);
    if (new Set(ids).size !== ids.length || ids.some((id) => !permitidas.has(id))) {
      throw new HttpError(400, 'Respostas não correspondem às perguntas da partida');
    }

    const gabarito = await client.query(
      'SELECT id, correta FROM jogo_perguntas WHERE id = ANY($1::uuid[])',
      [partida.perguntas],
    );
    const corretas = new Map(gabarito.rows.map((g) => [g.id, g.correta]));
    const acertos = req.body.respostas.filter((r) => corretas.get(r.perguntaId) === r.alternativa).length;
    const pontuacao = acertos * PONTOS_POR_ACERTO;

    await client.query(
      'UPDATE jogo_partidas SET finalizada_em = now(), acertos = $2, pontuacao = $3 WHERE id = $1',
      [partida.id, acertos, pontuacao],
    );
    return {
      acertos,
      total: partida.perguntas.length,
      pontuacao,
      gabarito: Object.fromEntries(corretas),
    };
  });
  res.json(resultado);
});

// Ranking: só primeiro nome + inicial do sobrenome (privacidade)
router.get('/ranking', async (req, res) => {
  const { rows } = await db.query(
    `WITH totais AS (
       SELECT p.aluno_id, u.nome, sum(p.pontuacao)::int AS pontos, count(*)::int AS partidas
         FROM jogo_partidas p JOIN usuarios u ON u.id = p.aluno_id
        WHERE p.finalizada_em IS NOT NULL
        GROUP BY p.aluno_id, u.nome
     ), ranqueado AS (
       SELECT *, rank() OVER (ORDER BY pontos DESC, partidas ASC)::int AS posicao FROM totais
     )
     SELECT posicao, nome, pontos, partidas, (aluno_id = $1) AS voce
       FROM ranqueado
      WHERE posicao <= 10 OR aluno_id = $1
      ORDER BY posicao`,
    [req.user.id],
  );
  const abreviar = (nome) => {
    const partes = nome.trim().split(/\s+/);
    return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
  };
  res.json(rows.map((r) => ({ ...r, nome: abreviar(r.nome) })));
});

module.exports = router;
