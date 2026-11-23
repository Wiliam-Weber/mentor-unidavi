import { api } from './api.js';
import { h, limpar, formulario, erroBox, DIAS } from './ui.js';
import { icone } from './icones.js';
import { telaSenha } from './telas/comum.js';
import { menuAluno } from './telas/aluno.js';
import { menuProfessor } from './telas/professor.js';
import { menuSecretaria } from './telas/secretaria.js';

const raiz = document.getElementById('app');
const MENUS = { aluno: menuAluno, professor: menuProfessor, secretaria: menuSecretaria };
const NOMES_PERFIL = { aluno: 'Aluno', professor: 'Professor', secretaria: 'Secretaria' };
let usuario = null;

function telaLogin() {
  limpar(raiz).append(h('div', { class: 'login' },
    h('div', { class: 'login-marca' },
      h('div', { class: 'logo' }, h('span', {}, 'Mentor')),
      h('p', {}, 'Portal acadêmico da UNIDAVI para alunos, professores e secretaria.')),
    h('div', { class: 'login-form' },
      h('h1', {}, 'Entrar'),
      formulario({
        botao: 'Entrar',
        campos: [
          { nome: 'email', rotulo: 'E-mail institucional', tipo: 'email', obrigatorio: true, autocomplete: 'username', max: 160 },
          { nome: 'senha', rotulo: 'Senha', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 128 },
        ],
        aoEnviar: async (d) => {
          const r = await api('POST', '/auth/login', d);
          usuario = r.usuario;
          iniciar();
        },
      }))));
}

async function sair() {
  try { await api('POST', '/auth/logout'); } catch { /* sessão já expirada */ }
  usuario = null;
  window.location.hash = '';
  telaLogin();
}

function agrupar(itens) {
  const grupos = new Map();
  for (const i of itens) {
    if (!grupos.has(i.grupo)) grupos.set(i.grupo, []);
    grupos.get(i.grupo).push(i);
  }
  return [...grupos.entries()];
}

function shell(itens, main) {
  const atual = window.location.hash.replace('#/', '') || 'inicio';
  const link = (id, rotulo, contador) => h('a', { href: `#/${id}`, 'aria-current': id === atual ? 'page' : null },
    rotulo, contador ? h('span', { class: 'contador', 'data-contador': contador, hidden: true }) : null);
  limpar(raiz).append(
    h('header', { class: 'topo' },
      h('a', { class: 'marca', href: '#/inicio' }, h('span', { class: 'marca-nome' }, 'Mentor'), h('span', { class: 'marca-inst' }, 'UNIDAVI')),
      h('div', { class: 'topo-info' },
        h('span', {}, NOMES_PERFIL[usuario.perfil], usuario.perfil === 'aluno' ? ' · Graduação' : ''),
        h('span', { class: 'topo-unidade' }, 'Rio do Sul')),
      h('div', { class: 'topo-usuario' },
        h('span', { class: 'topo-nome' }, usuario.nome),
        h('button', { type: 'button', class: 'sair', onclick: sair }, 'Sair'))),
    h('div', { class: 'shell' },
      h('aside', { class: 'lateral' },
        h('nav', { 'aria-label': 'Menu principal' },
          itens.length ? link('inicio', 'Início') : null,
          agrupar(itens).map(([grupo, lista]) => h('div', { class: 'nav-grupo' },
            h('div', { class: 'nav-titulo' }, grupo),
            lista.map((i) => link(i.id, i.rotulo, i.contador)))))),
      main));
  atualizarContadores();
}

// Bolinha com o número de mensagens não lidas (menu e ladrilho)
async function atualizarContadores() {
  try {
    const { qtd } = await api('GET', '/mensagens/nao-lidas');
    document.querySelectorAll('[data-contador="mensagens"]').forEach((el) => {
      el.textContent = qtd > 9 ? '9+' : String(qtd);
      el.hidden = qtd === 0;
      el.setAttribute('aria-label', `${qtd} não lida(s)`);
    });
  } catch { /* contador é opcional */ }
}
window.addEventListener('mentor:contadores', atualizarContadores);

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Uma linha de contexto no topo do início: o que importa hoje para cada perfil
async function resumo() {
  const hoje = ((new Date().getDay() + 6) % 7) + 1;
  try {
    if (usuario.perfil === 'aluno' || usuario.perfil === 'professor') {
      const rota = usuario.perfil === 'aluno' ? '/aluno/horarios' : '/professor/turmas';
      const aulas = (await api('GET', rota)).filter((a) => a.dia_semana === hoje);
      if (!aulas.length) return `Nenhuma aula hoje, ${DIAS[hoje].toLowerCase()}.`;
      return aulas.map((a) => `${a.hora_inicio} ${a.disciplina}${a.sala ? `, ${a.sala}` : ''}`).join('  ·  ');
    }
    const abertos = await api('GET', '/secretaria/requerimentos?status=aberto');
    if (!abertos.length) return 'Nenhum requerimento aguardando resposta.';
    return abertos.length === 1 ? '1 requerimento aguardando resposta.' : `${abertos.length} requerimentos aguardando resposta.`;
  } catch {
    return '';
  }
}

function ladrilho(i) {
  const extra = i.destaque ? h('span', { class: 'ladrilho-sub' }, 'Jogue e suba no ranking') : null;
  const el = h('a', { class: `ladrilho ${i.destaque ? 'ladrilho-destaque' : ''}`, href: `#/${i.id}` },
    icone(i.icone, i.destaque ? 40 : 30),
    h('span', { class: 'ladrilho-texto' }, i.rotulo, extra),
    i.contador ? h('span', { class: 'contador', 'data-contador': i.contador, hidden: true }) : null);
  if (i.destaque && i.id === 'basquete') {
    api('GET', '/basquete/ranking').then((r) => {
      const eu = r.ranking.find((x) => x.voce);
      extra.textContent = eu ? `Seu recorde: ${r.voce.recorde} pontos · ${eu.posicao}º lugar` : 'Você ainda não entrou no ranking';
    }).catch(() => {});
  }
  return el;
}

async function telaInicio(itens) {
  const primeiro = usuario.nome.split(/\s+/)[0];
  const linha = h('p', { class: 'inicio-hoje' });
  resumo().then((t) => { if (t) linha.append(h('span', { class: 'inicio-hoje-rotulo' }, 'Hoje'), t); });
  const linksArea = h('section', { class: 'bloco', hidden: true });
  api('GET', '/links').then((links) => {
    if (!links.length) return;
    linksArea.append(h('h2', {}, 'Links úteis'), h('div', { class: 'ladrilhos' }, links.map((l) => h('a', {
      class: 'ladrilho ladrilho-externo', href: l.url, target: '_blank', rel: 'noopener noreferrer',
    }, icone('externo'), h('span', { class: 'ladrilho-texto' }, l.titulo)))));
    linksArea.hidden = false;
  }).catch(() => {});
  return [
    h('div', { class: 'inicio-topo' }, h('h1', {}, `${saudacao()}, ${primeiro}`), linha),
    agrupar(itens).map(([grupo, lista]) => h('section', { class: 'bloco' },
      h('h2', {}, grupo),
      h('div', { class: 'ladrilhos' }, lista.map(ladrilho)))),
    linksArea,
  ];
}

async function rotear() {
  if (!usuario) return;
  const main = h('main', { id: 'conteudo', tabindex: '-1' });
  if (usuario.trocaSenhaObrigatoria) {
    shell([], main);
    main.append(...telaSenha(true, (u) => { usuario = u; window.location.hash = ''; rotear(); }));
    return;
  }
  const itens = MENUS[usuario.perfil] || [];
  const id = window.location.hash.replace('#/', '') || 'inicio';
  const item = id === 'inicio' ? { tela: () => telaInicio(itens) } : itens.find((i) => i.id === id);
  if (!item) { window.location.hash = '#/inicio'; return; }
  shell(itens, main);
  main.append(h('p', { class: 'vazio' }, 'Carregando...'));
  try {
    const conteudo = await item.tela();
    limpar(main).append(...[conteudo].flat(Infinity).filter(Boolean));
    if (item.depois) item.depois(main);
    atualizarContadores();
  } catch (e) {
    if (e.status === 401) { usuario = null; telaLogin(); return; }
    limpar(main).append(erroBox(e));
  }
  main.focus({ preventScroll: true });
}

async function iniciar() {
  try {
    usuario = (await api('GET', '/auth/me')).usuario;
    rotear();
  } catch {
    telaLogin();
  }
}

window.addEventListener('hashchange', rotear);
iniciar();
