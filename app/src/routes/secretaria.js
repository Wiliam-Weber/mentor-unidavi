'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { body, params, query, idParam, uuid, dataISO } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { cpfValido, mascararCpf, escaparLike, texto, telefone } = require('../utils/formatos');
const senhaUtil = require('../utils/senha');
const auditoria = require('../utils/auditoria');

const router = express.Router();
router.use(autenticar(), exigirPerfil('secretaria'));

// ---------- Alunos / matrícula ----------
const buscaSchema = z.object({ busca: z.string().trim().max(80).optional() });

router.get('/alunos', query(buscaSchema), async (req, res) => {
  const termo = `%${escaparLike(req.q.busca || '')}%`;
  const { rows } = await db.query(
    `SELECT u.id, u.nome, u.email, u.ativo, a.matricula, a.curso, a.cpf
       FROM usuarios u JOIN alunos a ON a.usuario_id = u.id
      WHERE u.nome ILIKE $1 OR a.matricula ILIKE $1 OR u.email ILIKE $1
      ORDER BY u.nome LIMIT 50`,
    [termo],
  );
  res.json(rows.map((r) => ({ ...r, cpf: mascararCpf(r.cpf) })));
});

const novoAlunoSchema = z.object({
  nome: texto(3, 120),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160),
  cpf: z.string().trim().refine(cpfValido, 'CPF inválido').transform((c) => c.replace(/\D/g, '')),
  matricula: z.string().trim().regex(/^[A-Za-z0-9]{4,20}$/, 'Matrícula deve ter de 4 a 20 letras ou números'),
  curso: texto(3, 120),
  dataNascimento: dataISO.optional(),
  telefone: telefone.optional(),
  endereco: texto(5, 200).optional(),
}).strict();

router.post('/alunos', body(novoAlunoSchema), async (req, res) => {
  const b = req.body;
  const senhaTemporaria = senhaUtil.gerarSenhaTemporaria();
  const hash = await senhaUtil.gerarHash(senhaTemporaria);
  const id = await db.transaction(async (client) => {
    const u = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, troca_senha_obrigatoria)
       VALUES ($1, $2, $3, 'aluno', true) RETURNING id`,
      [b.nome, b.email, hash],
    );
    await client.query(
      `INSERT INTO alunos (usuario_id, matricula, cpf, curso, data_nascimento, telefone, endereco)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [u.rows[0].id, b.matricula.toUpperCase(), b.cpf, b.curso, b.dataNascimento ?? null, b.telefone ?? null, b.endereco ?? null],
    );
    await auditoria.registrar(client, {
      usuarioId: req.user.id, acao: 'ALUNO_MATRICULADO', entidade: 'alunos', entidadeId: u.rows[0].id,
      dados: { matricula: b.matricula.toUpperCase() }, ip: req.ip,
    });
    return u.rows[0].id;
  });
  // A senha temporária é exibida UMA vez e deve ser trocada no primeiro acesso
  res.status(201).json({ id, senhaTemporaria });
});

router.get('/alunos/:id/turmas', params(idParam), async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, d.nome AS disciplina, t.semestre
       FROM turma_alunos ta JOIN turmas t ON t.id = ta.turma_id JOIN disciplinas d ON d.id = t.disciplina_id
      WHERE ta.aluno_id = $1 ORDER BY d.nome`,
    [req.p.id],
  );
  res.json(rows);
});

router.post('/alunos/:id/turmas', params(idParam), body(z.object({ turmaId: uuid }).strict()), async (req, res) => {
  const aluno = await db.query('SELECT 1 FROM alunos WHERE usuario_id = $1', [req.p.id]);
  if (!aluno.rowCount) throw new HttpError(404, 'Aluno não encontrado');
  const { rowCount } = await db.query(
    'INSERT INTO turma_alunos (turma_id, aluno_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.body.turmaId, req.p.id],
  );
  if (!rowCount) throw new HttpError(409, 'Aluno já matriculado nesta turma');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'MATRICULA_TURMA', entidade: 'turma_alunos', entidadeId: req.p.id, dados: { turmaId: req.body.turmaId }, ip: req.ip });
  res.status(201).json({ mensagem: 'Aluno matriculado na turma' });
});

router.patch('/alunos/:id/status', params(idParam), body(z.object({ ativo: z.boolean() }).strict()), async (req, res) => {
  const { rowCount } = await db.query(
    `UPDATE usuarios SET ativo = $2, token_version = token_version + 1, atualizado_em = now()
      WHERE id = $1 AND perfil = 'aluno'`,
    [req.p.id, req.body.ativo],
  );
  if (!rowCount) throw new HttpError(404, 'Aluno não encontrado');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: req.body.ativo ? 'ALUNO_ATIVADO' : 'ALUNO_DESATIVADO', entidade: 'usuarios', entidadeId: req.p.id, ip: req.ip });
  res.json({ mensagem: req.body.ativo ? 'Acesso ativado' : 'Acesso desativado' });
});

router.post('/alunos/:id/redefinir-senha', params(idParam), async (req, res) => {
  const senhaTemporaria = senhaUtil.gerarSenhaTemporaria();
  const { rowCount } = await db.query(
    `UPDATE usuarios SET senha_hash = $2, troca_senha_obrigatoria = true, token_version = token_version + 1,
            tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = now()
      WHERE id = $1 AND perfil = 'aluno'`,
    [req.p.id, await senhaUtil.gerarHash(senhaTemporaria)],
  );
  if (!rowCount) throw new HttpError(404, 'Aluno não encontrado');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'SENHA_REDEFINIDA', entidade: 'usuarios', entidadeId: req.p.id, ip: req.ip });
  res.json({ senhaTemporaria });
});

router.get('/turmas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, d.nome AS disciplina, t.semestre, u.nome AS professor, t.dia_semana,
            to_char(t.hora_inicio, 'HH24:MI') AS hora_inicio
       FROM turmas t JOIN disciplinas d ON d.id = t.disciplina_id JOIN usuarios u ON u.id = t.professor_id
      ORDER BY d.nome`,
  );
  res.json(rows);
});

// ---------- Financeiro ----------
const filtroParcelas = z.object({
  alunoId: uuid.optional(),
  status: z.enum(['aberta', 'paga', 'cancelada']).optional(),
});

router.get('/parcelas', query(filtroParcelas), async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.numero, p.competencia, p.vencimento, p.valor, p.status, p.pago_em,
            (p.status = 'aberta' AND p.vencimento < current_date) AS vencida, u.nome AS aluno, a.matricula
       FROM parcelas p JOIN usuarios u ON u.id = p.aluno_id JOIN alunos a ON a.usuario_id = p.aluno_id
      WHERE ($1::uuid IS NULL OR p.aluno_id = $1) AND ($2::status_parcela IS NULL OR p.status = $2)
      ORDER BY p.vencimento LIMIT 300`,
    [req.q.alunoId ?? null, req.q.status ?? null],
  );
  res.json(rows);
});

const gerarParcelasSchema = z.object({
  alunoId: uuid,
  quantidade: z.number().int().min(1).max(60),
  valor: z.number().min(0.01).max(100000),
  primeiroVencimento: dataISO,
}).strict();

router.post('/parcelas/gerar', body(gerarParcelasSchema), async (req, res) => {
  const b = req.body;
  const criadas = await db.transaction(async (client) => {
    const aluno = await client.query('SELECT 1 FROM alunos WHERE usuario_id = $1', [b.alunoId]);
    if (!aluno.rowCount) throw new HttpError(404, 'Aluno não encontrado');
    const base = await client.query('SELECT COALESCE(max(numero), 0)::int AS n FROM parcelas WHERE aluno_id = $1', [b.alunoId]);
    const { rowCount } = await client.query(
      `INSERT INTO parcelas (aluno_id, numero, competencia, vencimento, valor)
       SELECT $1, $2 + g, to_char($3::date + (g - 1) * interval '1 month', 'MM/YYYY'),
              ($3::date + (g - 1) * interval '1 month')::date, $4
         FROM generate_series(1, $5::int) AS g`,
      [b.alunoId, base.rows[0].n, b.primeiroVencimento, Math.round(b.valor * 100) / 100, b.quantidade],
    );
    await auditoria.registrar(client, { usuarioId: req.user.id, acao: 'PARCELAS_GERADAS', entidade: 'parcelas', entidadeId: b.alunoId, dados: { quantidade: b.quantidade, valor: b.valor }, ip: req.ip });
    return rowCount;
  });
  res.status(201).json({ mensagem: `${criadas} parcela(s) gerada(s)` });
});

async function alterarStatusParcela(req, res, novo, acao) {
  const { rows } = await db.query(
    `UPDATE parcelas SET status = $2, pago_em = CASE WHEN $2 = 'paga'::status_parcela THEN now() ELSE pago_em END
      WHERE id = $1 AND status = 'aberta' RETURNING id`,
    [req.p.id, novo],
  );
  if (!rows[0]) throw new HttpError(409, 'Parcela não encontrada ou não está em aberto');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao, entidade: 'parcelas', entidadeId: req.p.id, ip: req.ip });
  res.json({ mensagem: 'Parcela atualizada' });
}
router.patch('/parcelas/:id/pagamento', params(idParam), (req, res) => alterarStatusParcela(req, res, 'paga', 'PARCELA_PAGA'));
router.patch('/parcelas/:id/cancelamento', params(idParam), (req, res) => alterarStatusParcela(req, res, 'cancelada', 'PARCELA_CANCELADA'));

// ---------- Requerimentos ----------
const filtroReq = z.object({ status: z.enum(['aberto', 'em_analise', 'deferido', 'indeferido']).optional() });

router.get('/requerimentos', query(filtroReq), async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.id, tr.nome AS tipo, r.descricao, r.status, r.resposta, r.criado_em, r.atualizado_em,
            u.nome AS aluno, a.matricula
       FROM requerimentos r
       JOIN tipos_requerimento tr ON tr.id = r.tipo_id
       JOIN usuarios u ON u.id = r.aluno_id
       JOIN alunos a ON a.usuario_id = r.aluno_id
      WHERE ($1::status_requerimento IS NULL OR r.status = $1)
      ORDER BY r.criado_em DESC LIMIT 300`,
    [req.q.status ?? null],
  );
  res.json(rows);
});

const respostaSchema = z.object({
  status: z.enum(['em_analise', 'deferido', 'indeferido']),
  resposta: texto(3, 2000).optional(),
}).strict().refine((d) => d.status === 'em_analise' || d.resposta, { message: 'Informe a resposta ao aluno', path: ['resposta'] });

router.patch('/requerimentos/:id', params(idParam), body(respostaSchema), async (req, res) => {
  const { rows } = await db.query(
    `UPDATE requerimentos SET status = $2, resposta = COALESCE($3, resposta), respondido_por = $4, atualizado_em = now()
      WHERE id = $1 AND status IN ('aberto', 'em_analise') RETURNING id`,
    [req.p.id, req.body.status, req.body.resposta ?? null, req.user.id],
  );
  if (!rows[0]) throw new HttpError(409, 'Requerimento não encontrado ou já finalizado');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'REQUERIMENTO_RESPONDIDO', entidade: 'requerimentos', entidadeId: req.p.id, dados: { status: req.body.status }, ip: req.ip });
  res.json({ mensagem: 'Requerimento atualizado' });
});

router.get('/tipos-requerimento', async (req, res) => {
  const { rows } = await db.query('SELECT id, nome, descricao, prazo_dias, ativo FROM tipos_requerimento ORDER BY nome');
  res.json(rows);
});

const tipoSchema = z.object({
  nome: texto(3, 80),
  descricao: texto(3, 500),
  prazoDias: z.number().int().min(1).max(90),
}).strict();

router.post('/tipos-requerimento', body(tipoSchema), async (req, res) => {
  const { rows } = await db.query(
    'INSERT INTO tipos_requerimento (nome, descricao, prazo_dias) VALUES ($1, $2, $3) RETURNING id',
    [req.body.nome, req.body.descricao, req.body.prazoDias],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'TIPO_REQUERIMENTO_CRIADO', entidade: 'tipos_requerimento', entidadeId: rows[0].id, ip: req.ip });
  res.status(201).json(rows[0]);
});

router.patch('/tipos-requerimento/:id', params(idParam), body(tipoSchema.partial().extend({ ativo: z.boolean().optional() }).strict()), async (req, res) => {
  const b = req.body;
  if (Object.keys(b).length === 0) throw new HttpError(400, 'Nada para atualizar');
  const { rowCount } = await db.query(
    `UPDATE tipos_requerimento SET nome = COALESCE($2, nome), descricao = COALESCE($3, descricao),
            prazo_dias = COALESCE($4, prazo_dias), ativo = COALESCE($5, ativo)
      WHERE id = $1`,
    [req.p.id, b.nome ?? null, b.descricao ?? null, b.prazoDias ?? null, b.ativo ?? null],
  );
  if (!rowCount) throw new HttpError(404, 'Tipo não encontrado');
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'TIPO_REQUERIMENTO_ALTERADO', entidade: 'tipos_requerimento', entidadeId: req.p.id, dados: b, ip: req.ip });
  res.json({ mensagem: 'Tipo atualizado' });
});

module.exports = router;
