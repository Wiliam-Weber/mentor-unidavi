// Helpers de interface. Todo conteúdo dinâmico entra via textContent/createTextNode
// (nunca innerHTML) -> proteção contra XSS.
export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export function limpar(el) { el.replaceChildren(); return el; }

export function mensagem(tipo, texto, detalhes) {
  return h('div', { class: `msg msg-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' },
    texto,
    detalhes?.length ? h('ul', {}, detalhes.map((d) => h('li', {}, d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem))) : null);
}

export function erroBox(e) { return mensagem('erro', e.message, e.detalhes); }

export function tabela(colunas, linhas, opcoes = {}) {
  if (!linhas || linhas.length === 0) return h('p', { class: 'vazio' }, opcoes.vazio || 'Nenhum registro encontrado.');
  return h('div', { class: 'tabela-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.num ? 'num' : null, scope: 'col' }, c.titulo)))),
    h('tbody', {}, linhas.map((l) => h('tr', { class: opcoes.classeLinha?.(l) || null },
      colunas.map((c) => h('td', { class: c.num ? 'num' : null }, c.valor(l))))))));
}

export function selo(texto, tipo = '') { return h('span', { class: `selo ${tipo ? `selo-${tipo}` : ''}` }, texto); }

// Formulário genérico: campos -> objeto JSON tipado
export function formulario({ campos, botao = 'Salvar', aoEnviar, classe = '', depois }) {
  const area = h('div');
  const btn = h('button', { type: 'submit' }, botao);
  const controles = {};
  const blocos = campos.map((c) => {
    const id = `f-${c.nome}-${Math.random().toString(36).slice(2, 8)}`;
    let ctrl;
    if (c.tipo === 'textarea') ctrl = h('textarea', { id, name: c.nome, maxlength: c.max, required: c.obrigatorio, value: c.valor ?? '' });
    else if (c.tipo === 'select') {
      ctrl = h('select', { id, name: c.nome, required: c.obrigatorio },
        h('option', { value: '' }, c.placeholder || 'Selecione...'),
        (c.opcoes || []).map((o) => h('option', { value: o.valor, selected: String(o.valor) === String(c.valor ?? '') }, o.rotulo)));
    } else if (c.tipo === 'checkbox') ctrl = h('input', { id, name: c.nome, type: 'checkbox', checked: c.valor });
    else {
      ctrl = h('input', {
        id, name: c.nome, type: c.tipo || 'text', required: c.obrigatorio, maxlength: c.max, min: c.minimo,
        max: c.maximo, step: c.passo, autocomplete: c.autocomplete || 'off', value: c.valor ?? '', placeholder: c.placeholder,
      });
    }
    controles[c.nome] = { ctrl, c };
    return h('div', { class: `campo ${c.tipo === 'checkbox' ? 'campo-check' : ''}` },
      c.tipo === 'checkbox' ? [ctrl, h('label', { for: id }, c.rotulo)] : [h('label', { for: id }, c.rotulo), ctrl]);
  });
  const form = h('form', { class: classe, novalidate: false }, area, blocos, h('div', { class: 'acoes' }, btn));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpar(area);
    const dados = {};
    for (const [nome, { ctrl, c }] of Object.entries(controles)) {
      if (c.tipo === 'checkbox') dados[nome] = ctrl.checked;
      else if (ctrl.value === '') { if (c.obrigatorio) dados[nome] = ''; }
      else if (c.tipo === 'number') dados[nome] = Number(ctrl.value);
      else dados[nome] = ctrl.value;
    }
    btn.disabled = true;
    try {
      const msg = await aoEnviar(dados, form);
      if (msg) area.append(msg instanceof Node ? msg : mensagem('ok', msg));
      if (depois) await depois();
    } catch (e) {
      area.append(erroBox(e));
    } finally {
      btn.disabled = false;
    }
  });
  return form;
}

export const fmt = {
  data: (v) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('pt-BR') : '-'),
  dataHora: (v) => (v ? new Date(v).toLocaleString('pt-BR') : '-'),
  moeda: (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  nota: (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })),
};

export const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export const STATUS_REQ = {
  aberto: ['Aberto', 'aviso'], em_analise: ['Em análise', ''], deferido: ['Deferido', 'ok'], indeferido: ['Indeferido', 'alerta'],
};
export function seloRequerimento(s) { const [t, c] = STATUS_REQ[s] || [s, '']; return selo(t, c); }
export function seloParcela(p) {
  if (p.status === 'paga') return selo('Paga', 'ok');
  if (p.status === 'cancelada') return selo('Cancelada');
  return p.vencida ? selo('Vencida', 'alerta') : selo('Em aberto', 'aviso');
}

export async function carregar(alvo, fn) {
  limpar(alvo).append(h('p', { class: 'vazio' }, 'Carregando...'));
  try {
    const conteudo = await fn();
    limpar(alvo).append(...[].concat(conteudo));
  } catch (e) {
    limpar(alvo).append(erroBox(e));
  }
}
