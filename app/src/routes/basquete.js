'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { body, params, query, idParam } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const auditoria = require('../utils/auditoria');
const Fisica = require('../../public/js/basquete-fisica');

const router = express.Router();
router.use(autenticar(), exigirPerfil('aluno'));

const { C } = Fisica;
const PARTIDAS_POR_DIA = 15;
const FOLGA_ENVIO_MS = 30_000; // tempo extra para a animação final e a rede

const limite = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

router.post('/partidas', limite, async (req, res) => {
  const hoje = await db.query(
    "SELECT count(*)::int AS qtd FROM basquete_partidas WHERE aluno_id = $1 AND iniciada_em >= date_trunc('day', now())",
    [req.user.id],
  );
  if (hoje.rows[0].qtd >= PARTIDAS_POR_DIA) throw new HttpError(429, `Limite de ${PARTIDAS_POR_DIA} partidas por dia. O ginásio reabre amanhã!`);
  // Semente aleatória gerada no SERVIDOR: define as posições de arremesso da partida
  const semente = crypto.randomInt(1, 2 ** 31 - 1);
  const { rows } = await db.query(
    'INSERT INTO basquete_partidas (aluno_id, semente) VALUES ($1, $2) RETURNING id',
    [req.user.id, semente],
  );
  res.status(201).json({ partidaId: rows[0].id, semente, duracaoMs: C.DURACAO_MS, restantesHoje: PARTIDAS_POR_DIA - hoje.rows[0].qtd - 1 });
});

const envio = z.object({
  arremessos: z.array(z.object({
    t: z.number().int().min(0).max(C.DURACAO_MS),
    angulo: z.number().min(C.ANG_MIN).max(C.ANG_MAX),
    forca: z.number().min(C.F_MIN).max(C.F_MAX),
  }).strict()).max(C.MAX_ARREMESSOS),
}).strict();

router.post('/partidas/:id/finalizar', limite, params(idParam), body(envio), async (req, res) => {
  const resultado = await db.transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, semente, iniciada_em, finalizada_em FROM basquete_partidas WHERE id = $1 AND aluno_id = $2 FOR UPDATE',
      [req.p.id, req.user.id],
    );
    const p = rows[0];
    if (!p) throw new HttpError(404, 'Partida não encontrada');
    if (p.finalizada_em) throw new HttpError(409, 'Esta partida já foi encerrada');

    const decorrido = Date.now() - new Date(p.iniciada_em).getTime();
    const ultimo = req.body.arremessos.at(-1)?.t ?? 0;
    // Anti-trapaça temporal: não dá para "jogar" 60 s em menos tempo real, nem guardar a partida para depois
    if (decorrido + 2000 < ultimo) throw new HttpError(400, 'Partida inconsistente com o tempo real decorrido');
    if (decorrido > C.DURACAO_MS + FOLGA_ENVIO_MS) {
      await client.query('UPDATE basquete_partidas SET finalizada_em = now() WHERE id = $1', [p.id]);
      throw new HttpError(400, 'Partida expirada');
    }

    let apurado;
    try {
      apurado = Fisica.apurarPartida(p.semente, req.body.arremessos); // re-simulação no servidor
    } catch (e) {
      await client.query('UPDATE basquete_partidas SET finalizada_em = now() WHERE id = $1', [p.id]);
      await auditoria.registrar(client, { usuarioId: req.user.id, acao: 'JOGO_PARTIDA_REJEITADA', entidade: 'basquete_partidas', entidadeId: p.id, dados: { motivo: e.message }, ip: req.ip });
      throw new HttpError(400, `Partida rejeitada: ${e.message}`);
    }

    const recordeAnterior = await client.query(
      'SELECT COALESCE(max(pontos), 0)::int AS max FROM basquete_partidas WHERE aluno_id = $1 AND finalizada_em IS NOT NULL',
      [req.user.id],
    );
    await client.query(
      `UPDATE basquete_partidas SET finalizada_em = now(), pontos = $2, cestas = $3, arremessos = $4, swishes = $5, melhor_sequencia = $6
        WHERE id = $1`,
      [p.id, apurado.pontos, apurado.cestas, apurado.arremessos, apurado.swishes, apurado.melhorSequencia],
    );
    return { ...apurado, recorde: apurado.pontos > recordeAnterior.rows[0].max && apurado.pontos > 0 };
  });
  res.json(resultado);
});

const filtroRanking = z.object({ periodo: z.enum(['geral', 'semana']).default('geral') });

const abreviar = (nome) => {
  const p = nome.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
};

router.get('/ranking', query(filtroRanking), async (req, res) => {
  const semana = req.q.periodo === 'semana';
  const { rows } = await db.query(
    `WITH melhores AS (
       SELECT DISTINCT ON (bp.aluno_id) bp.aluno_id, bp.pontos, bp.cestas, bp.arremessos, bp.melhor_sequencia, bp.finalizada_em
         FROM basquete_partidas bp
        WHERE bp.finalizada_em IS NOT NULL AND bp.pontos > 0
          AND ($2::boolean IS FALSE OR bp.finalizada_em >= date_trunc('week', now()))
        ORDER BY bp.aluno_id, bp.pontos DESC, bp.finalizada_em ASC
     ), ranqueado AS (
       SELECT m.*, u.nome, rank() OVER (ORDER BY m.pontos DESC, m.finalizada_em ASC)::int AS posicao
         FROM melhores m JOIN usuarios u ON u.id = m.aluno_id
     )
     SELECT posicao, nome, pontos, cestas, arremessos, melhor_sequencia, (aluno_id = $1) AS voce
       FROM ranqueado WHERE posicao <= 10 OR aluno_id = $1 ORDER BY posicao`,
    [req.user.id, semana],
  );
  const stats = await db.query(
    `SELECT count(*)::int AS partidas, COALESCE(max(pontos), 0)::int AS recorde, COALESCE(sum(cestas), 0)::int AS cestas,
            COALESCE(sum(arremessos), 0)::int AS arremessos, COALESCE(max(melhor_sequencia), 0)::int AS melhor_sequencia,
            COALESCE(sum(swishes), 0)::int AS swishes
       FROM basquete_partidas WHERE aluno_id = $1 AND finalizada_em IS NOT NULL`,
    [req.user.id],
  );
  res.json({ ranking: rows.map((r) => ({ ...r, nome: abreviar(r.nome) })), voce: stats.rows[0] });
});

module.exports = router;
