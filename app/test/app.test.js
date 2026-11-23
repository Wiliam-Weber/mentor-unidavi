'use strict';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('base64'); // gerado a cada execução
process.env.DATABASE_URL = '';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { politicaSenha, gerarSenhaTemporaria } = require('../src/utils/senha');
const { cpfValido, mascararCpf, escaparLike } = require('../src/utils/formatos');

const app = createApp();

describe('infraestrutura HTTP', () => {
  test('health check responde 200 para o ALB', async () => {
    const r = await request(app).get('/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { status: 'ok' });
  });

  test('envia cabeçalhos de segurança', async () => {
    const r = await request(app).get('/health');
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.ok(r.headers['strict-transport-security']);
    assert.equal(r.headers['x-powered-by'], undefined);
  });

  test('serve o frontend estático', async () => {
    const r = await request(app).get('/');
    assert.equal(r.status, 200);
    assert.match(r.text, /Mentor UNIDAVI/);
  });
});

describe('autenticação e autorização', () => {
  for (const rota of ['/api/aluno/horarios', '/api/professor/turmas', '/api/secretaria/alunos', '/api/jogo/ranking', '/api/auth/me',
    '/api/mensagens', '/api/materiais', '/api/bolsas/minhas', '/api/atividades/minhas', '/api/eventos', '/api/documentos/meus',
    '/api/avaliacao/pendentes', '/api/rematricula', '/api/historico/escolar', '/api/links', '/api/basquete/ranking']) {
    test(`${rota} exige autenticação`, async () => {
      const r = await request(app).get(rota);
      assert.equal(r.status, 401);
    });
  }

  test('token forjado é rejeitado', async () => {
    const jwt = require('jsonwebtoken');
    const falso = jwt.sign({ sub: 'x', perfil: 'secretaria', tv: 0 }, require('crypto').randomBytes(48).toString('hex'));
    const r = await request(app).get('/api/secretaria/alunos').set('Cookie', `mentor_sessao=${falso}`);
    assert.equal(r.status, 401);
  });

  test('token com algoritmo "none" é rejeitado', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'x', perfil: 'secretaria', tv: 0 })).toString('base64url');
    const r = await request(app).get('/api/secretaria/alunos').set('Cookie', `mentor_sessao=${header}.${payload}.`);
    assert.equal(r.status, 401);
  });
});

describe('proteções de entrada', () => {
  test('POST sem header anti-CSRF é bloqueado', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'a@b.com', senha: 'x' });
    assert.equal(r.status, 403);
  });

  test('login com e-mail inválido retorna 400', async () => {
    const r = await request(app).post('/api/auth/login').set('X-Requested-With', 'mentor-web').send({ email: 'nao-e-email', senha: 'x' });
    assert.equal(r.status, 400);
    assert.equal(r.body.erro, 'Dados inválidos');
  });

  test('campos extras são rejeitados (mass assignment)', async () => {
    const r = await request(app).post('/api/auth/login').set('X-Requested-With', 'mentor-web')
      .send({ email: 'a@b.com', senha: 'x', perfil: 'secretaria' });
    assert.equal(r.status, 400);
  });

  test('JSON malformado retorna 400 sem stack trace', async () => {
    const r = await request(app).post('/api/auth/login').set('X-Requested-With', 'mentor-web')
      .set('Content-Type', 'application/json').send('{"email":');
    assert.equal(r.status, 400);
    assert.equal(r.body.erro, 'JSON inválido');
    assert.ok(!JSON.stringify(r.body).includes('at '));
  });

  test('corpo muito grande retorna 413', async () => {
    const r = await request(app).post('/api/auth/login').set('X-Requested-With', 'mentor-web')
      .send({ email: 'a@b.com', senha: 'x'.repeat(30000) });
    assert.equal(r.status, 413);
  });

  test('rota inexistente retorna 404', async () => {
    const r = await request(app).get('/api/nao-existe');
    assert.equal(r.status, 404);
  });
});

describe('validação pública de certificado', () => {
  test('código em formato inválido retorna 404 sem consultar o banco', async () => {
    const r = await request(app).get('/api/eventos/certificados/nao-e-um-codigo');
    assert.equal(r.status, 404);
  });
});

describe('utilitários de segurança', () => {
  test('código de certificado tem 12 caracteres sem ambiguidade', () => {
    const { gerarCodigo } = require('../src/utils/codigos');
    const vistos = new Set();
    for (let i = 0; i < 500; i += 1) {
      const c = gerarCodigo();
      assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      vistos.add(c);
    }
    assert.equal(vistos.size, 500);
  });

  test('política de senha', () => {
    assert.equal(politicaSenha.safeParse('curta').success, false);
    assert.equal(politicaSenha.safeParse('semnumeroMaiuscula!').success, false);
    assert.equal(politicaSenha.safeParse('Sem-especial-123'.replace('-', '')).success, true);
    assert.equal(politicaSenha.safeParse('Valida#Senha2026').success, true);
  });

  test('senha temporária sempre atende a política', () => {
    for (let i = 0; i < 200; i += 1) assert.equal(politicaSenha.safeParse(gerarSenhaTemporaria()).success, true);
  });

  test('validação e máscara de CPF', () => {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('111.111.111-11'), false);
    assert.equal(cpfValido('123.456.789-00'), false);
    assert.equal(mascararCpf('52998224725'), '***.982.247-**');
  });

  test('escapa curingas do LIKE', () => {
    assert.equal(escaparLike('100%_a\\'), '100\\%\\_a\\\\');
  });
});
