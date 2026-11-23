'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { body } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { autenticar, emitirSessao, encerrarSessao } = require('../middleware/auth');
const senhaUtil = require('../utils/senha');
const auditoria = require('../utils/auditoria');

const router = express.Router();
const MAX_TENTATIVAS = 5;

// Proteção contra força bruta: limite por IP + bloqueio temporário por conta
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

const perfilPublico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, trocaSenhaObrigatoria: u.troca_senha_obrigatoria,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160),
  senha: z.string().min(1, 'Informe a senha').max(128),
}).strict();

router.post('/login', limiteLogin, body(loginSchema), async (req, res) => {
  const { email, senha } = req.body;
  const { rows } = await db.query(
    `SELECT id, nome, email, perfil, senha_hash, ativo, tentativas_falhas, bloqueado_ate,
            token_version, troca_senha_obrigatoria
       FROM usuarios WHERE lower(email) = $1`,
    [email],
  );
  const u = rows[0];
  const senhaOk = await senhaUtil.verificar(senha, u ? u.senha_hash : senhaUtil.obterHashFicticio());
  const bloqueado = Boolean(u?.bloqueado_ate && new Date(u.bloqueado_ate) > new Date());

  if (!u || !u.ativo || bloqueado || !senhaOk) {
    if (u && !bloqueado && !senhaOk) {
      const tentativas = u.tentativas_falhas + 1;
      const bloquear = tentativas >= MAX_TENTATIVAS;
      await db.query(
        `UPDATE usuarios SET tentativas_falhas = $2,
                bloqueado_ate = CASE WHEN $3 THEN now() + interval '15 minutes' ELSE bloqueado_ate END
          WHERE id = $1`,
        [u.id, bloquear ? 0 : tentativas, bloquear],
      );
      if (bloquear) {
        await auditoria.registrar(db, { usuarioId: u.id, acao: 'CONTA_BLOQUEADA', entidade: 'usuarios', entidadeId: u.id, ip: req.ip });
      }
    }
    await auditoria.registrar(db, { usuarioId: u?.id, acao: 'LOGIN_FALHA', entidade: 'usuarios', dados: { email }, ip: req.ip });
    // Mensagem genérica: não revela se o e-mail existe nem o motivo exato
    throw new HttpError(401, 'Credenciais inválidas ou conta temporariamente bloqueada.');
  }

  await db.query(
    'UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login = now() WHERE id = $1',
    [u.id],
  );
  await auditoria.registrar(db, { usuarioId: u.id, acao: 'LOGIN_OK', entidade: 'usuarios', entidadeId: u.id, ip: req.ip });
  emitirSessao(res, u);
  res.json({ usuario: perfilPublico(u) });
});

router.get('/me', autenticar({ permitirTrocaPendente: true }), (req, res) => {
  res.json({ usuario: perfilPublico(req.user) });
});

// Logout invalida TODAS as sessões do usuário (incrementa token_version)
router.post('/logout', autenticar({ permitirTrocaPendente: true }), async (req, res) => {
  await db.query('UPDATE usuarios SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'LOGOUT', entidade: 'usuarios', entidadeId: req.user.id, ip: req.ip });
  encerrarSessao(res);
  res.status(204).end();
});

const trocaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual').max(128),
  novaSenha: senhaUtil.politicaSenha,
}).strict().refine((d) => d.senhaAtual !== d.novaSenha, {
  message: 'A nova senha deve ser diferente da atual', path: ['novaSenha'],
});

router.post('/alterar-senha', limiteLogin, autenticar({ permitirTrocaPendente: true }), body(trocaSchema), async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  const { rows } = await db.query('SELECT senha_hash, email FROM usuarios WHERE id = $1', [req.user.id]);
  if (!(await senhaUtil.verificar(senhaAtual, rows[0].senha_hash))) {
    await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'SENHA_ALTERACAO_FALHA', entidade: 'usuarios', entidadeId: req.user.id, ip: req.ip });
    throw new HttpError(400, 'Senha atual incorreta');
  }
  if (novaSenha.toLowerCase().includes(rows[0].email.split('@')[0].toLowerCase())) {
    throw new HttpError(400, 'A senha não pode conter o seu e-mail');
  }
  const hash = await senhaUtil.gerarHash(novaSenha);
  const atualizado = await db.query(
    `UPDATE usuarios SET senha_hash = $2, token_version = token_version + 1,
            troca_senha_obrigatoria = false, atualizado_em = now()
      WHERE id = $1
      RETURNING id, nome, email, perfil, token_version, troca_senha_obrigatoria`,
    [req.user.id, hash],
  );
  await auditoria.registrar(db, { usuarioId: req.user.id, acao: 'SENHA_ALTERADA', entidade: 'usuarios', entidadeId: req.user.id, ip: req.ip });
  // Outras sessões são invalidadas; esta recebe um token novo
  emitirSessao(res, atualizado.rows[0]);
  res.json({ mensagem: 'Senha alterada com sucesso', usuario: perfilPublico(atualizado.rows[0]) });
});

module.exports = router;
