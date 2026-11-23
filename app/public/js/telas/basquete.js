import { api } from '../api.js';
import { h, limpar, erroBox, carregar, tabela } from '../ui.js';

const F = globalThis.BasqueteFisica;
const { C } = F;
const ESCALA = 2; // resolução interna do canvas (nitidez em telas de alta densidade)

const COR = {
  paredeTopo: '#0f203b', paredeBase: '#1d3a66', faixa: '#f2b705', piso: '#d8a46a', pisoEscuro: '#c48f55',
  linha: '#f6efe3', aro: '#e2571e', bola: '#e8772e', costura: '#5a2a0e', camisa: '#13294b', pele: '#c98b5e',
  texto: '#ffffff',
};

function limitar(v, min, max) { return Math.max(min, Math.min(max, v)); }

export async function telaBasquete() {
  const canvas = h('canvas', { width: C.LARGURA * ESCALA, height: C.ALTURA * ESCALA, class: 'quadra', tabindex: '0',
    'aria-label': 'Quadra de basquete. Arraste para mirar e solte para arremessar. Pelo teclado: setas ajustam ângulo e força, espaço arremessa.' });
  const ctx = canvas.getContext('2d');
  const sobre = h('div', { class: 'quadra-sobre' });
  const leitura = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const rankingArea = h('div');
  const statsArea = h('div', { class: 'jogo-stats' });
  let periodo = 'geral';

  // ---------- Estado ----------
  let estado = 'menu'; // menu | jogando | fim
  let partida = null;
  let inicio = 0;
  let arremessos = [];
  let xs = [];
  let bola = null; // { quadros, i0, resultado, x0, t }
  let mira = { angulo: 52, forca: 950 };
  let arrasto = null;
  let pontos = 0;
  let sequencia = 0;
  let cestas = 0;
  let textos = [];
  let particulas = [];
  let rede = 0;
  let enviando = false;
  let quadroAnimacao = 0;

  const tempoDecorrido = () => (estado === 'jogando' ? performance.now() - inicio : 0);
  const restante = () => Math.max(0, C.DURACAO_MS - tempoDecorrido());
  const xAtual = () => xs[arremessos.length] ?? C.X_MAX;

  // ---------- Desenho ----------
  function fundo() {
    const g = ctx.createLinearGradient(0, 0, 0, 470);
    g.addColorStop(0, COR.paredeTopo);
    g.addColorStop(1, COR.paredeBase);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.LARGURA, 470);
    // faixa e letreiro na parede do ginásio
    ctx.fillStyle = COR.faixa;
    ctx.fillRect(0, 440, C.LARGURA, 6);
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#fff';
    ctx.font = '800 150px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('UNIDAVI', 40, 220);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('GINÁSIO DE ESPORTES · RIO DO SUL', 40, 432);
    // piso de madeira
    ctx.fillStyle = COR.piso;
    ctx.fillRect(0, 446, C.LARGURA, C.ALTURA - 446);
    ctx.strokeStyle = COR.pisoEscuro;
    ctx.lineWidth = 1;
    for (let y = 458; y < C.ALTURA; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.LARGURA, y); ctx.stroke();
    }
    for (let x = 30; x < C.LARGURA; x += 120) {
      for (let y = 446, k = 0; y < C.ALTURA; y += 14, k += 1) {
        const dx = (k % 2) * 60;
        ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x + dx, y + 14); ctx.stroke();
      }
    }
    // garrafão e linha de 3
    ctx.fillStyle = 'rgba(19,41,75,.18)';
    ctx.fillRect(700, C.CHAO - 6, 200, 12);
    ctx.strokeStyle = COR.linha;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(C.LINHA_3, C.CHAO - 8); ctx.lineTo(C.LINHA_3, C.CHAO + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, C.CHAO); ctx.lineTo(C.LARGURA, C.CHAO); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = COR.linha;
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('3 PONTOS', C.LINHA_3 - 72, C.CHAO + 26);
    ctx.fillText('2 PONTOS', C.LINHA_3 + 14, C.CHAO + 26);
  }

  function cesta() {
    // poste e braço
    ctx.fillStyle = '#9aa7b8';
    ctx.fillRect(918, 170, 12, C.CHAO - 170);
    ctx.fillRect(870, 196, 52, 8);
    ctx.fillStyle = '#5d6b7e';
    ctx.fillRect(904, C.CHAO - 10, 40, 12);
    // tabela
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillRect(C.TABELA_X, C.TABELA_TOPO, 8, C.TABELA_BASE - C.TABELA_TOPO);
    ctx.strokeStyle = COR.aro;
    ctx.lineWidth = 2;
    ctx.strokeRect(C.TABELA_X + 1, 186, 6, 48);
    // rede (balança depois de uma cesta)
    const balanco = Math.sin(quadroAnimacao / 3) * rede * 6;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 1.2;
    const topoE = C.ARO_FRENTE;
    const topoD = C.ARO_FUNDO;
    const baseY = C.ARO_Y + 52 + rede * 8;
    const baseE = 802 + balanco;
    const baseD = 834 + balanco;
    for (let i = 0; i <= 6; i += 1) {
      const f = i / 6;
      ctx.beginPath();
      ctx.moveTo(topoE + (topoD - topoE) * f, C.ARO_Y);
      ctx.lineTo(baseE + (baseD - baseE) * f, baseY);
      ctx.stroke();
    }
    for (let k = 1; k <= 3; k += 1) {
      const y = C.ARO_Y + (baseY - C.ARO_Y) * (k / 4);
      const f = k / 4;
      ctx.beginPath();
      ctx.moveTo(topoE + (baseE - topoE) * f, y);
      ctx.lineTo(topoD + (baseD - topoD) * f, y);
      ctx.stroke();
    }
    // aro
    ctx.strokeStyle = COR.aro;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(C.ARO_FRENTE, C.ARO_Y); ctx.lineTo(C.TABELA_X, C.ARO_Y); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function jogador(x, comBola) {
    const fogo = sequencia >= 3;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(x, C.CHAO + 2, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
    // pernas
    ctx.fillStyle = '#1b2433';
    ctx.fillRect(x - 10, 468, 8, 32);
    ctx.fillRect(x + 2, 468, 8, 32);
    // tênis
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 12, 496, 12, 5);
    ctx.fillRect(x + 1, 496, 12, 5);
    // camisa
    ctx.fillStyle = COR.camisa;
    ctx.beginPath(); ctx.roundRect(x - 14, 424, 28, 46, 5); ctx.fill();
    ctx.fillStyle = COR.faixa;
    ctx.fillRect(x - 14, 424, 28, 3);
    ctx.font = '800 15px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('60', x, 453);
    ctx.textAlign = 'left';
    // braços erguidos até a bola
    ctx.strokeStyle = COR.pele;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 12, 430); ctx.lineTo(x - 8, comBola ? C.SOLTURA_Y + 8 : 404);
    ctx.moveTo(x + 12, 430); ctx.lineTo(x + 8, comBola ? C.SOLTURA_Y + 8 : 404);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // cabeça
    ctx.fillStyle = COR.pele;
    ctx.beginPath(); ctx.arc(x, 410, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fogo ? '#ff7a1a' : '#2a1a10';
    ctx.beginPath(); ctx.arc(x, 406, 11, Math.PI, 0); ctx.fill();
    if (comBola) desenharBola(x, C.SOLTURA_Y, 0, false);
  }

  function desenharBola(x, y, giro, emChamas) {
    if (emChamas) {
      particulas.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, vida: 1 });
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(giro);
    ctx.fillStyle = COR.bola;
    ctx.beginPath(); ctx.arc(0, 0, C.RAIO, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COR.costura;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-C.RAIO, 0); ctx.lineTo(C.RAIO, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -C.RAIO); ctx.lineTo(0, C.RAIO); ctx.stroke();
    ctx.beginPath(); ctx.arc(-C.RAIO * 1.25, 0, C.RAIO * 0.95, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(C.RAIO * 1.25, 0, C.RAIO * 0.95, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    ctx.restore();
  }

  function desenharMira() {
    const x0 = xAtual();
    const previa = F.simular(x0, mira.angulo, mira.forca, true).quadros;
    // só o começo da trajetória: dá a direção sem entregar a cesta
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 6; i < Math.min(previa.length / 2, 40); i += 4) {
      ctx.beginPath(); ctx.arc(previa[i * 2], previa[i * 2 + 1], 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // medidor de força
    const p = (mira.forca - C.F_MIN) / (C.F_MAX - C.F_MIN);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x0, C.SOLTURA_Y, 34, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
    ctx.strokeStyle = p > 0.8 ? '#ff6b3d' : COR.faixa;
    ctx.beginPath(); ctx.arc(x0, C.SOLTURA_Y, 34, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * p)); ctx.stroke();
  }

  function hud() {
    const r = restante();
    const virada = estado === 'jogando' && tempoDecorrido() >= C.VIRADA_MS;
    // barra de tempo
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.fillRect(24, 22, 300, 8);
    ctx.fillStyle = virada ? '#ff6b3d' : COR.faixa;
    ctx.fillRect(24, 22, 300 * (r / C.DURACAO_MS), 8);
    ctx.fillStyle = COR.texto;
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(r / 1000)}s`, 336, 32);
    if (virada) {
      ctx.fillStyle = '#ffb199';
      ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('Hora da virada: pontos em dobro', 24, 54);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.texto;
    ctx.font = '800 44px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(String(pontos), C.LARGURA - 120, 56);
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText(`${cestas}/${arremessos.length} cestas`, C.LARGURA - 120, 76);
    if (sequencia >= 3) {
      ctx.fillStyle = '#ff9a3d';
      ctx.font = '800 15px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`Em chamas · ${sequencia} seguidas`, C.LARGURA - 120, 98);
    }
    ctx.textAlign = 'left';
  }

  function efeitos(dt) {
    particulas = particulas.filter((p) => p.vida > 0);
    for (const p of particulas) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt * 2.2;
      ctx.fillStyle = `rgba(255,${Math.round(120 + 100 * p.vida)},40,${Math.max(0, p.vida)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 5 * p.vida, 0, Math.PI * 2); ctx.fill();
    }
    textos = textos.filter((t) => t.vida > 0);
    ctx.textAlign = 'center';
    for (const t of textos) {
      t.y -= 40 * dt; t.vida -= dt * 0.8;
      ctx.globalAlpha = Math.max(0, Math.min(1, t.vida * 1.5));
      ctx.fillStyle = t.cor;
      ctx.font = `800 ${t.tam}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(t.texto, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    rede = Math.max(0, rede - dt * 0.9);
  }

  function flutuar(texto, x, y, cor = '#fff', tam = 26) { textos.push({ texto, x, y, cor, tam, vida: 1.3 }); }

  // ---------- Lógica ----------
  function arremessar() {
    if (estado !== 'jogando' || bola) return;
    const t = Math.round(tempoDecorrido());
    if (t > C.DURACAO_MS) return;
    const x0 = xAtual();
    const cmd = { t, angulo: Math.round(mira.angulo * 10) / 10, forca: Math.round(mira.forca) };
    const resultado = F.simular(x0, cmd.angulo, cmd.forca, true);
    arremessos.push(cmd);
    bola = { quadros: resultado.quadros, resultado, x0, t, inicio: performance.now(), anunciado: false };
  }

  function concluirArremesso() {
    const { resultado, x0, t } = bola;
    if (resultado.cesta) {
      sequencia += 1;
      cestas += 1;
      const ganho = F.pontosDaCesta(x0, resultado.swish, sequencia, t);
      pontos += ganho;
      leitura.textContent = `Cesta! Mais ${ganho} pontos. Total ${pontos}.`;
    } else {
      sequencia = 0;
      flutuar('Errou', bola.quadros.at(-2), C.CHAO - 30, 'rgba(255,255,255,.7)', 18);
      leitura.textContent = 'Errou.';
    }
    bola = null;
    if (restante() <= 0) encerrar();
  }

  function anunciarCesta() {
    const { resultado, x0, t } = bola;
    const ganho = F.pontosDaCesta(x0, resultado.swish, sequencia + 1, t);
    rede = 1;
    flutuar(`+${ganho}`, 818, C.ARO_Y - 30, COR.faixa, 34);
    if (resultado.swish) flutuar('Swish!', 818, C.ARO_Y - 70, '#ffffff', 20);
    else if (resultado.tabela) flutuar('Tabela!', 818, C.ARO_Y - 70, '#ffffff', 18);
    if (sequencia + 1 === 3) flutuar('Em chamas!', 600, 180, '#ff9a3d', 30);
  }

  function quadro(agora) {
    if (!canvas.isConnected) return; // saiu da tela: para o laço
    const dt = Math.min(0.05, (agora - (quadro.ultimo || agora)) / 1000);
    quadro.ultimo = agora;
    quadroAnimacao += 1;
    ctx.setTransform(ESCALA, 0, 0, ESCALA, 0, 0);
    fundo();
    cesta();
    if (estado === 'jogando') {
      if (bola) {
        const i = Math.min(bola.quadros.length / 2 - 1, Math.floor((agora - bola.inicio) / 1000 / C.DT));
        jogador(bola.x0, false);
        if (!bola.anunciado && bola.resultado.cesta && i >= bola.resultado.quadroCesta) { anunciarCesta(); bola.anunciado = true; }
        const bx = bola.quadros[i * 2];
        const by = bola.quadros[i * 2 + 1];
        desenharBola(bx, by, (bx - bola.x0) / C.RAIO, sequencia >= 3);
        if (by < -C.RAIO) { // bola acima da tela: seta indicando onde ela está
          ctx.fillStyle = COR.faixa;
          ctx.beginPath(); ctx.moveTo(bx, 6); ctx.lineTo(bx - 7, 18); ctx.lineTo(bx + 7, 18); ctx.closePath(); ctx.fill();
        }
        if (i >= bola.quadros.length / 2 - 1) concluirArremesso();
      } else if (restante() > 0) {
        jogador(xAtual(), true);
        desenharMira();
      } else {
        encerrar();
      }
    } else {
      jogador(520, true);
    }
    efeitos(dt);
    if (estado === 'jogando') hud();
    requestAnimationFrame(quadro);
  }

  // ---------- Entrada (mouse, toque e teclado) ----------
  function ponto(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * C.LARGURA, y: ((ev.clientY - r.top) / r.height) * C.ALTURA };
  }
  canvas.addEventListener('pointerdown', (ev) => {
    if (estado !== 'jogando' || bola) return;
    canvas.setPointerCapture(ev.pointerId);
    arrasto = ponto(ev);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!arrasto) return;
    const p = ponto(ev);
    // estilingue: puxa para trás e para baixo, a bola sai no sentido oposto
    const dx = arrasto.x - p.x;
    const dy = p.y - arrasto.y;
    if (Math.hypot(dx, dy) < 6) return;
    mira.angulo = limitar((Math.atan2(dy, dx) * 180) / Math.PI, C.ANG_MIN, C.ANG_MAX);
    mira.forca = limitar(C.F_MIN + (Math.hypot(dx, dy) / 260) * (C.F_MAX - C.F_MIN), C.F_MIN, C.F_MAX);
  });
  const soltar = () => {
    if (!arrasto) return;
    arrasto = null;
    arremessar();
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', () => { arrasto = null; });
  canvas.addEventListener('keydown', (ev) => {
    if (estado !== 'jogando') return;
    const passos = { ArrowUp: ['angulo', 1], ArrowDown: ['angulo', -1], ArrowRight: ['forca', 10], ArrowLeft: ['forca', -10] };
    if (passos[ev.key]) {
      const [campo, d] = passos[ev.key];
      mira[campo] = campo === 'angulo' ? limitar(mira.angulo + d, C.ANG_MIN, C.ANG_MAX) : limitar(mira.forca + d, C.F_MIN, C.F_MAX);
      ev.preventDefault();
    } else if (ev.key === ' ' || ev.key === 'Enter') {
      arremessar();
      ev.preventDefault();
    }
  });

  // ---------- Fluxo da partida ----------
  function telaMenu(erro) {
    limpar(sobre).append(h('div', { class: 'quadra-cartaz' },
      h('h2', {}, 'Arremesso UNIDAVI'),
      h('p', {}, '60 segundos para fazer o máximo de pontos. Arraste para trás a partir de qualquer ponto da quadra, como um estilingue, e solte para arremessar.'),
      h('ul', {},
        h('li', {}, 'Atrás da linha: 3 pontos. Na frente: 2.'),
        h('li', {}, 'Swish (sem tocar no aro): +1.'),
        h('li', {}, 'Três cestas seguidas: em chamas, +1 por cesta.'),
        h('li', {}, 'Últimos 10 segundos: pontos em dobro.')),
      erro ? erroBox(erro) : null,
      h('button', { type: 'button', onclick: comecar }, 'Começar partida')));
    sobre.hidden = false;
  }

  async function comecar() {
    try {
      partida = await api('POST', '/basquete/partidas');
    } catch (e) {
      telaMenu(e);
      return;
    }
    xs = F.posicoes(partida.semente);
    arremessos = []; pontos = 0; sequencia = 0; cestas = 0; bola = null; textos = []; particulas = [];
    mira = { angulo: 52, forca: 950 };
    estado = 'jogando';
    inicio = performance.now();
    sobre.hidden = true;
    canvas.focus();
    leitura.textContent = 'Partida iniciada. 60 segundos.';
  }

  async function encerrar() {
    if (estado !== 'jogando' || enviando) return;
    if (bola) return; // espera a bola no ar terminar
    estado = 'fim';
    enviando = true;
    limpar(sobre).append(h('div', { class: 'quadra-cartaz' }, h('p', {}, 'Conferindo a partida no servidor...')));
    sobre.hidden = false;
    try {
      const r = await api('POST', `/basquete/partidas/${partida.partidaId}/finalizar`, { arremessos });
      const aproveitamento = r.arremessos ? Math.round((r.cestas / r.arremessos) * 100) : 0;
      limpar(sobre).append(h('div', { class: 'quadra-cartaz' },
        r.recorde ? h('p', { class: 'recorde' }, 'Novo recorde pessoal') : null,
        h('div', { class: 'placar-final' }, String(r.pontos), h('small', {}, 'pontos')),
        h('dl', { class: 'resumo-partida' },
          h('dt', {}, 'Cestas'), h('dd', {}, `${r.cestas} de ${r.arremessos} (${aproveitamento}%)`),
          h('dt', {}, 'Swishes'), h('dd', {}, String(r.swishes)),
          h('dt', {}, 'Maior sequência'), h('dd', {}, String(r.melhorSequencia))),
        h('button', { type: 'button', onclick: comecar }, 'Jogar de novo')));
      leitura.textContent = `Fim de jogo. ${r.pontos} pontos.`;
      atualizarRanking();
    } catch (e) {
      telaMenu(e);
    } finally {
      enviando = false;
    }
  }

  // ---------- Ranking ----------
  function atualizarRanking() {
    carregar(rankingArea, async () => {
      const r = await api('GET', `/basquete/ranking?periodo=${periodo}`);
      const v = r.voce;
      limpar(statsArea).append(
        h('div', {}, h('strong', {}, String(v.recorde)), h('span', {}, 'seu recorde')),
        h('div', {}, h('strong', {}, String(v.partidas)), h('span', {}, 'partidas')),
        h('div', {}, h('strong', {}, v.arremessos ? `${Math.round((v.cestas / v.arremessos) * 100)}%` : '-'), h('span', {}, 'aproveitamento')),
        h('div', {}, h('strong', {}, String(v.melhor_sequencia)), h('span', {}, 'maior sequência')),
      );
      return tabela([
        { titulo: '', num: true, valor: (l) => h('span', { class: `posicao p${l.posicao}` }, `${l.posicao}º`) },
        { titulo: 'Aluno', valor: (l) => (l.voce ? `${l.nome} (você)` : l.nome) },
        { titulo: 'Pontos', num: true, valor: (l) => l.pontos },
        { titulo: 'Cestas', num: true, valor: (l) => `${l.cestas}/${l.arremessos}` },
      ], r.ranking, { vazio: periodo === 'semana' ? 'Ninguém jogou esta semana ainda.' : 'Ninguém pontuou ainda.', classeLinha: (l) => (l.voce ? 'voce' : '') });
    });
  }
  const aba = (id, rotulo) => h('button', { type: 'button', class: 'aba', 'aria-pressed': String(periodo === id), onclick: (ev) => {
    periodo = id;
    ev.currentTarget.parentElement.querySelectorAll('.aba').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
    atualizarRanking();
  } }, rotulo);

  telaMenu();
  atualizarRanking();
  requestAnimationFrame(quadro);

  return [
    h('h1', {}, 'Arremesso UNIDAVI'),
    h('div', { class: 'jogo' },
      h('div', { class: 'quadra-wrap' }, canvas, sobre, leitura),
      h('aside', { class: 'painel jogo-lateral' },
        statsArea,
        h('div', { class: 'abas', role: 'group', 'aria-label': 'Período do ranking' }, aba('geral', 'Geral'), aba('semana', 'Esta semana')),
        rankingArea,
        h('p', { class: 'nota-anticheat' }, 'O placar é recalculado no servidor a partir de cada arremesso. Pontuação enviada pelo navegador não é aceita.'))),
  ];
}
