'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { body, params, idParam, uuid, dataISO } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { texto } = require('../utils/formatos');
const auditoria = require('../utils/auditoria');
const { gerarCodigo } = require('../utils/codigos');

const router = express.Router();

// ----- Validação PÚBLICA de certificado (qualquer pessoa confere a autenticidade) -----
const limiteValidacao = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
router.get('/certificados/:codigo', limiteValidacao, async (req, res) => {
  const codigo = String(req.params.codigo).toUpperCase();
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codigo)) throw new HttpError(404, 'Certificado não encontrado');
  const { rows } = await db.query(
    `SELECT u.nome AS participante, e.titulo AS evento, e.data, e.carga_horaria
       FROM eventos_inscricoes i JOIN eventos e ON e.id = i.evento_id JOIN usuarios u ON u.id = i.aluno_id
      WHERE i.codigo_certificado = $1 AND i.presente`,
    [codigo],
  );
  if (!rows[0]) throw new HttpError(404, 'Certificado não encontrado');
  res.json({ valido: true, ...rows[0] }); // nenhum dado além do que está impresso no certificado
});

router.use(autenticar());

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.id, e.titulo, e.descricao, e.local, e.data, e.carga_horaria, e.vagas,
            (SELECT count(*)::int FROM eventos_inscricoes i WHERE i.evento_id = e.id) AS inscritos,
            EXISTS (SELECT 1 FROM eventos_inscricoes i WHERE i.evento_id = e.id AND i.aluno_id = $1) AS inscrito
       FROM eventos e ORDER BY e.data DESC LIMIT 100`,
    [req.user.id],
  );
  res.json(rows);
});

router.post('/:id/inscricao', exigirPerfil('aluno'), params(idParam), async (req, res) => {
  await db.transaction(async (client) => {
    // FOR UPDATE: evita estourar as vagas com inscrições simultâneas
    const { rows } = await client.query('SELECT vagas, data FROM eventos WHERE id = $1 FOR UPDATE', [req.p.id]);
    if (!rows[0]) throw new HttpError(404, 'Evento não encontrado');
    if (new Date(rows[0].data) < new Date(new Date().toDateString())) throw new HttpError(400, 'As inscrições deste evento já encerraram');
    const ocupadas = await client.query('SELECT count(*)::int AS n FROM eventos_inscricoes WHERE evento_id = $1', [req.p.id]);
    if (ocupadas.rows[0].n >= rows[0].vagas) throw new HttpError(409, 'Não há mais vagas');
    const ins = await client.query('INSERT INTO eventos_inscricoes (evento_id, aluno_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.p.id, req.user.id]);
    if (!ins.rowCount) throw new HttpError(409, 'Você já está inscrito');
  });
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'EVENTO_INSCRICAO', entidade: 'eventos', entidadeId: req.p.id, ip: req.ip });
  res.status(201).json({ mensagem: 'Inscrição confirmada' });
});

router.get('/meus-certificados', exigirPerfil('aluno'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.titulo, e.data, e.carga_horaria, e.local, i.codigo_certificado, u.nome
       FROM eventos_inscricoes i JOIN eventos e ON e.id = i.evento_id JOIN usuarios u ON u.id = i.aluno_id
      WHERE i.aluno_id = $1 AND i.presente ORDER BY e.data DESC`,
    [req.user.id],
  );
  res.json(rows);
});

// ----- Secretaria -----
const eventoSchema = z.object({
  titulo: texto(3, 160),
  descricao: texto(0, 2000).optional(),
  local: texto(2, 120).optional(),
  data: dataISO,
  cargaHoraria: z.number().int().min(1).max(200),
  vagas: z.number().int().min(1).max(5000),
}).strict();

router.post('/', exigirPerfil('secretaria'), body(eventoSchema), async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `INSERT INTO eventos (titulo, descricao, local, data, carga_horaria, vagas, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [b.titulo, b.descricao || null, b.local || null, b.data, b.cargaHoraria, b.vagas, req.user.id],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'EVENTO_CRIADO', entidade: 'eventos', entidadeId: rows[0].id, ip: req.ip });
  res.status(201).json(rows[0]);
});

router.get('/:id/inscritos', exigirPerfil('secretaria'), params(idParam), async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id AS aluno_id, u.nome, a.matricula, i.inscrito_em, i.presente, i.codigo_certificado
       FROM eventos_inscricoes i JOIN usuarios u ON u.id = i.aluno_id JOIN alunos a ON a.usuario_id = i.aluno_id
      WHERE i.evento_id = $1 ORDER BY u.nome`,
    [req.p.id],
  );
  res.json(rows);
});

router.post('/:id/presencas', exigirPerfil('secretaria'), params(idParam), body(z.object({ alunoId: uuid }).strict()), async (req, res) => {
  const { rows } = await db.query(
    `UPDATE eventos_inscricoes SET presente = true, codigo_certificado = COALESCE(codigo_certificado, $3)
      WHERE evento_id = $1 AND aluno_id = $2 RETURNING codigo_certificado`,
    [req.p.id, req.body.alunoId, gerarCodigo()],
  );
  if (!rows[0]) throw new HttpError(404, 'Inscrição não encontrada');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'EVENTO_PRESENCA', entidade: 'eventos', entidadeId: req.p.id, dados: { alunoId: req.body.alunoId }, ip: req.ip });
  res.json({ codigo: rows[0].codigo_certificado });
});

module.exports = { router };
