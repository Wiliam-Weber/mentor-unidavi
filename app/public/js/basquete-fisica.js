/*
 * Física do jogo "Arremesso UNIDAVI".
 * O MESMO arquivo roda no navegador (desenho) e no servidor (validação):
 * o cliente envia apenas os comandos dos arremessos (instante, ângulo, força)
 * e a API re-simula tudo para calcular a pontuação. Assim, uma pontuação
 * forjada na requisição é impossível: o placar sempre sai do servidor.
 */
(function (raiz, fabrica) {
  'use strict';
  const modulo = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else raiz.BasqueteFisica = modulo;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const C = Object.freeze({
    LARGURA: 960,
    ALTURA: 540,
    G: 1500, // px/s²
    DT: 1 / 120, // passo fixo de simulação (determinístico)
    RAIO: 14,
    CHAO: 500,
    SOLTURA_Y: 382,
    ARO_Y: 240,
    ARO_FRENTE: 790,
    ARO_FUNDO: 846,
    ARO_R: 3,
    TABELA_X: 862,
    TABELA_TOPO: 132,
    TABELA_BASE: 262,
    LINHA_3: 400, // atrás desta linha a cesta vale 3
    X_MIN: 170,
    X_MAX: 640,
    DURACAO_MS: 60000,
    VIRADA_MS: 50000, // últimos 10 s: pontos em dobro
    ANG_MIN: 15,
    ANG_MAX: 80,
    F_MIN: 300,
    F_MAX: 1400,
    TEMPO_MAX_BOLA: 4,
    MAX_ARREMESSOS: 60,
    RESTITUICAO_ARO: 0.55,
    RESTITUICAO_TABELA: 0.6,
  });

  // Gerador pseudoaleatório com semente (mulberry32): mesma semente => mesmas posições
  function gerador(semente) {
    let a = semente >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function posicoes(semente, quantidade = C.MAX_ARREMESSOS) {
    const r = gerador(semente);
    const lista = [];
    for (let i = 0; i < quantidade; i += 1) {
      // As primeiras posições são mais perto; depois o jogo afasta o arremessador
      const alcance = Math.min(1, 0.35 + i * 0.06);
      lista.push(Math.round(C.X_MAX - r() * alcance * (C.X_MAX - C.X_MIN)));
    }
    return lista;
  }

  function colidirAro(b, px, py, contato) {
    const dx = b.x - px;
    const dy = b.y - py;
    const d = Math.hypot(dx, dy);
    const min = C.RAIO + C.ARO_R;
    if (d >= min || d === 0) return false;
    const nx = dx / d;
    const ny = dy / d;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + C.RESTITUICAO_ARO) * vn * nx;
      b.vy -= (1 + C.RESTITUICAO_ARO) * vn * ny;
      b.vx *= 0.92;
      b.vy *= 0.92;
    }
    b.x = px + nx * min;
    b.y = py + ny * min;
    contato.aro = true;
    return true;
  }

  /**
   * Simula um arremesso. Retorna o resultado e, opcionalmente, a trajetória
   * quadro a quadro (usada só pelo navegador para animar).
   */
  function simular(x0, angulo, forca, registrar = false) {
    const rad = (angulo * Math.PI) / 180;
    const b = { x: x0, y: C.SOLTURA_Y, vx: Math.cos(rad) * forca, vy: -Math.sin(rad) * forca };
    const contato = { aro: false, tabela: false };
    const quadros = registrar ? [] : null;
    let cesta = false;
    let quadroCesta = -1;
    let passos = 0;
    const maxPassos = Math.round(C.TEMPO_MAX_BOLA / C.DT);

    while (passos < maxPassos) {
      passos += 1;
      const yAntes = b.y;
      b.vy += C.G * C.DT;
      b.x += b.vx * C.DT;
      b.y += b.vy * C.DT;

      colidirAro(b, C.ARO_FRENTE, C.ARO_Y, contato);
      colidirAro(b, C.ARO_FUNDO, C.ARO_Y, contato);

      // Tabela (plano vertical)
      if (b.x + C.RAIO > C.TABELA_X && b.x < C.TABELA_X && b.y > C.TABELA_TOPO && b.y < C.TABELA_BASE && b.vx > 0) {
        b.vx = -b.vx * C.RESTITUICAO_TABELA;
        b.x = C.TABELA_X - C.RAIO;
        contato.tabela = true;
      }

      if (!cesta && yAntes < C.ARO_Y && b.y >= C.ARO_Y && b.vy > 0
        && b.x > C.ARO_FRENTE + C.ARO_R && b.x < C.ARO_FUNDO - C.ARO_R) {
        cesta = true;
        quadroCesta = passos;
        // A rede segura a bola
        b.vx *= 0.25;
        b.vy *= 0.45;
      }

      if (quadros) quadros.push(b.x, b.y);

      if (cesta && b.y > C.ARO_Y + 90) break;
      if (b.y + C.RAIO >= C.CHAO) break;
      if (b.x < -C.RAIO || b.x > C.LARGURA + C.RAIO) break;
    }

    return {
      cesta,
      swish: cesta && !contato.aro && !contato.tabela,
      tabela: contato.tabela,
      aro: contato.aro,
      duracaoMs: Math.round(passos * C.DT * 1000),
      quadroCesta,
      quadros,
    };
  }

  // Pontuação de uma cesta, considerando sequência e "hora da virada"
  function pontosDaCesta(x0, swish, sequencia, t) {
    let p = x0 < C.LINHA_3 ? 3 : 2;
    if (swish) p += 1;
    if (sequencia >= 3) p += 1; // "em chamas"
    if (t >= C.VIRADA_MS) p *= 2;
    return p;
  }

  function validarNumero(v, min, max) {
    return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  }

  /**
   * Re-simula uma partida inteira a partir dos comandos enviados pelo cliente.
   * Lança erro se os comandos forem fisicamente impossíveis (ex.: arremessar
   * antes de a bola anterior terminar o voo, ou depois do fim do tempo).
   */
  function apurarPartida(semente, arremessos) {
    if (!Array.isArray(arremessos) || arremessos.length > C.MAX_ARREMESSOS) {
      throw new Error('Quantidade de arremessos inválida');
    }
    const xs = posicoes(semente);
    let liberadoEm = 0;
    let pontos = 0;
    let cestas = 0;
    let swishes = 0;
    let sequencia = 0;
    let melhorSequencia = 0;
    const detalhes = [];

    arremessos.forEach((a, i) => {
      if (!a || !validarNumero(a.t, 0, C.DURACAO_MS) || !Number.isInteger(a.t)) throw new Error(`Arremesso ${i + 1}: instante inválido`);
      if (!validarNumero(a.angulo, C.ANG_MIN, C.ANG_MAX)) throw new Error(`Arremesso ${i + 1}: ângulo inválido`);
      if (!validarNumero(a.forca, C.F_MIN, C.F_MAX)) throw new Error(`Arremesso ${i + 1}: força inválida`);
      if (a.t < liberadoEm) throw new Error(`Arremesso ${i + 1}: feito antes da bola anterior terminar`);

      const r = simular(xs[i], a.angulo, a.forca);
      liberadoEm = a.t + r.duracaoMs - 50; // tolerância de 50 ms para variação de quadros
      let ganho = 0;
      if (r.cesta) {
        sequencia += 1;
        cestas += 1;
        if (r.swish) swishes += 1;
        ganho = pontosDaCesta(xs[i], r.swish, sequencia, a.t);
        pontos += ganho;
        melhorSequencia = Math.max(melhorSequencia, sequencia);
      } else {
        sequencia = 0;
      }
      detalhes.push({ x: xs[i], cesta: r.cesta, swish: r.swish, pontos: ganho });
    });

    return { pontos, cestas, arremessos: arremessos.length, swishes, melhorSequencia, detalhes };
  }

  return { C, gerador, posicoes, simular, pontosDaCesta, apurarPartida };
}));
