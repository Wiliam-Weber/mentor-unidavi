'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../public/js/basquete-fisica');

const { C } = F;

// Procura um arremesso que entra (simula o que um jogador habilidoso faria)
function tiroCerteiro(x) {
  for (let a = 40; a <= 75; a += 1) {
    for (let f = 600; f <= 1400; f += 2) {
      if (F.simular(x, a, f).cesta) return { angulo: a, forca: f };
    }
  }
  return null;
}

describe('física do jogo de basquete', () => {
  test('simulação é determinística (servidor e navegador chegam ao mesmo resultado)', () => {
    const a = F.simular(400, 54.3, 951, true);
    const b = F.simular(400, 54.3, 951, true);
    assert.deepEqual(a, b);
  });

  test('mesma semente gera as mesmas posições', () => {
    assert.deepEqual(F.posicoes(12345), F.posicoes(12345));
    assert.notDeepEqual(F.posicoes(12345), F.posicoes(54321));
    for (const x of F.posicoes(999)) assert.ok(x >= C.X_MIN && x <= C.X_MAX);
  });

  test('é possível acertar de qualquer posição da quadra', () => {
    for (const x of [C.X_MIN, 300, C.LINHA_3, 520, C.X_MAX]) assert.ok(tiroCerteiro(x), `sem cesta possível em x=${x}`);
  });

  test('pontuação: 2/3 pontos, swish, em chamas e hora da virada', () => {
    assert.equal(F.pontosDaCesta(C.LINHA_3 - 1, false, 1, 0), 3);
    assert.equal(F.pontosDaCesta(C.LINHA_3 + 1, false, 1, 0), 2);
    assert.equal(F.pontosDaCesta(C.LINHA_3 + 1, true, 1, 0), 3);
    assert.equal(F.pontosDaCesta(C.LINHA_3 + 1, true, 3, 0), 4);
    assert.equal(F.pontosDaCesta(C.LINHA_3 + 1, false, 1, C.VIRADA_MS), 4);
  });
});

describe('apuração anti-trapaça', () => {
  const semente = 424242;
  const xs = F.posicoes(semente);

  test('apura uma partida legítima', () => {
    const arr = [];
    let t = 300;
    for (let i = 0; i < 4; i += 1) {
      const tiro = tiroCerteiro(xs[i]);
      arr.push({ t, ...tiro });
      t += F.simular(xs[i], tiro.angulo, tiro.forca).duracaoMs + 200;
    }
    const r = F.apurarPartida(semente, arr);
    assert.equal(r.cestas, 4);
    assert.equal(r.melhorSequencia, 4);
    assert.ok(r.pontos >= 8);
  });

  test('rejeita arremesso com a bola anterior ainda no ar', () => {
    assert.throws(() => F.apurarPartida(semente, [{ t: 0, angulo: 50, forca: 900 }, { t: 200, angulo: 50, forca: 900 }]), /antes da bola anterior/);
  });

  test('rejeita valores fora dos limites físicos', () => {
    assert.throws(() => F.apurarPartida(semente, [{ t: 0, angulo: 89, forca: 900 }]), /ângulo/);
    assert.throws(() => F.apurarPartida(semente, [{ t: 0, angulo: 50, forca: 99999 }]), /força/);
    assert.throws(() => F.apurarPartida(semente, [{ t: C.DURACAO_MS + 1, angulo: 50, forca: 900 }]), /instante/);
    assert.throws(() => F.apurarPartida(semente, [{ t: 1.5, angulo: 50, forca: 900 }]), /instante/);
  });

  test('rejeita partidas com arremessos demais', () => {
    const muitos = Array.from({ length: C.MAX_ARREMESSOS + 1 }, (_, i) => ({ t: i * 900, angulo: 50, forca: 900 }));
    assert.throws(() => F.apurarPartida(semente, muitos), /Quantidade/);
  });

  test('o placar não depende de nada enviado pelo cliente além dos comandos', () => {
    const r = F.apurarPartida(semente, [{ t: 0, angulo: 50, forca: 900, pontos: 9999 }]);
    assert.ok(r.pontos < 10);
  });
});
