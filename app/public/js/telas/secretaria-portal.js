import { api } from '../api.js';
import { h, tabela, formulario, fmt, selo, carregar, limpar, mensagem } from '../ui.js';

const STATUS_BOLSA = { enviada: ['Enviada', 'aviso'], em_analise: ['Em análise', ''], deferida: ['Deferida', 'ok'], indeferida: ['Indeferida', 'alerta'] };
const STATUS_DOC = { pendente: ['Pendente', 'alerta'], entregue: ['Entregue', 'aviso'], aprovado: ['Aprovado', 'ok'], recusado: ['Recusado', 'alerta'] };
const seloDe = (mapa, s) => { const [t, c] = mapa[s] || [s, '']; return selo(t, c); };

function filtroSelect(opcoes, aoMudar, rotulo) {
  const sel = h('select', { 'aria-label': rotulo }, opcoes.map(([v, t]) => h('option', { value: v }, t)));
  sel.addEventListener('change', aoMudar);
  return sel;
}

// ---------- Bolsas ----------
export async function bolsas() {
  const lista = h('div');
  const filtro = filtroSelect([['', 'Todas'], ['enviada', 'Enviadas'], ['em_analise', 'Em análise'], ['deferida', 'Deferidas'], ['indeferida', 'Indeferidas']], () => atualizar(), 'Situação');
  const analisar = (b) => formulario({
    botao: 'Salvar análise',
    campos: [
      { nome: 'status', rotulo: 'Decisão', tipo: 'select', obrigatorio: true, opcoes: [
        { valor: 'em_analise', rotulo: 'Em análise' }, { valor: 'deferida', rotulo: 'Deferir' }, { valor: 'indeferida', rotulo: 'Indeferir' }] },
      { nome: 'percentual', rotulo: 'Percentual da bolsa (se deferida)', tipo: 'number', minimo: 1, maximo: 100 },
      { nome: 'resposta', rotulo: 'Resposta ao aluno', tipo: 'textarea', max: 2000 },
    ],
    aoEnviar: async (d) => { await api('PATCH', `/bolsas/${b.id}`, d); atualizar(); },
  });
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Aluno', valor: (b) => `${b.matricula} – ${b.aluno}` },
    { titulo: 'Programa', valor: (b) => b.programa_nome },
    { titulo: 'Renda per capita', num: true, valor: (b) => fmt.moeda(b.renda_per_capita) },
    { titulo: 'Justificativa', valor: (b) => h('details', {}, h('summary', {}, 'Ler'), h('p', {}, b.justificativa)) },
    { titulo: 'Situação', valor: (b) => h('div', {}, seloDe(STATUS_BOLSA, b.status), b.percentual ? ` ${Number(b.percentual)}%` : '') },
    { titulo: '', valor: (b) => (['enviada', 'em_analise'].includes(b.status) ? h('details', {}, h('summary', {}, 'Analisar'), analisar(b)) : (b.resposta || '-')) },
  ], await api('GET', `/bolsas${filtro.value ? `?status=${filtro.value}` : ''}`), { vazio: 'Nenhuma solicitação.' }));
  atualizar();
  return [
    h('h1', {}, 'Bolsas de estudo'),
    h('p', {}, 'Lista ordenada pela menor renda per capita. Os dados de renda são sigilosos (LGPD) e não vão para os logs.'),
    h('div', { class: 'painel' }, h('div', { class: 'campo' }, filtro), lista),
  ];
}

// ---------- Atividades complementares ----------
export async function atividades() {
  const lista = h('div');
  const filtro = filtroSelect([['enviada', 'Aguardando validação'], ['aprovada', 'Aprovadas'], ['reprovada', 'Reprovadas'], ['', 'Todas']], () => atualizar(), 'Situação');
  const avaliar = (a) => formulario({
    botao: 'Salvar',
    campos: [
      { nome: 'status', rotulo: 'Decisão', tipo: 'select', obrigatorio: true, opcoes: [{ valor: 'aprovada', rotulo: 'Aprovar' }, { valor: 'reprovada', rotulo: 'Reprovar' }] },
      { nome: 'horasAprovadas', rotulo: 'Horas aceitas', tipo: 'number', minimo: 0, maximo: a.horas, valor: a.horas },
      { nome: 'parecer', rotulo: 'Parecer', tipo: 'textarea', max: 1000 },
    ],
    aoEnviar: async (d) => { await api('PATCH', `/atividades/${a.id}`, d); atualizar(); },
  });
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Aluno', valor: (a) => `${a.matricula} – ${a.aluno}` },
    { titulo: 'Atividade', valor: (a) => h('div', {}, h('strong', {}, a.titulo), h('div', { class: 'sub' }, `${a.categoria} · ${fmt.data(a.data)}`)) },
    { titulo: 'Horas', num: true, valor: (a) => a.horas },
    { titulo: '', valor: (a) => (a.status === 'enviada' ? h('details', {}, h('summary', {}, 'Validar'), avaliar(a))
      : h('div', {}, selo(a.status === 'aprovada' ? `Aprovada (${a.horas_aprovadas} h)` : 'Reprovada', a.status === 'aprovada' ? 'ok' : 'alerta'))) },
  ], await api('GET', `/atividades${filtro.value ? `?status=${filtro.value}` : ''}`), { vazio: 'Nada por aqui.' }));
  atualizar();
  return [h('h1', {}, 'Atividades complementares'), h('div', { class: 'painel' }, h('div', { class: 'campo' }, filtro), lista)];
}

// ---------- Documentos ----------
export async function documentos() {
  const alunos = await api('GET', '/secretaria/alunos');
  const area = h('div');
  const sel = h('select', { 'aria-label': 'Aluno' }, h('option', { value: '' }, 'Selecione o aluno...'),
    alunos.map((a) => h('option', { value: a.id }, `${a.matricula} – ${a.nome}`)));
  const abrir = () => {
    if (!sel.value) { limpar(area); return; }
    carregar(area, async () => {
      const docs = await api('GET', `/documentos/aluno/${sel.value}`);
      return tabela([
        { titulo: 'Documento', valor: (d) => d.tipo },
        { titulo: 'Situação', valor: (d) => seloDe(STATUS_DOC, d.status) },
        { titulo: 'Observação', valor: (d) => d.observacao || '-' },
        { titulo: 'Alterar', valor: (d) => {
          const s = h('select', { class: 'pequeno', 'aria-label': `Situação de ${d.tipo}` },
            Object.entries(STATUS_DOC).map(([v, [t]]) => h('option', { value: v, selected: v === d.status }, t)));
          s.addEventListener('change', async () => {
            const corpo = { tipo: d.tipo, status: s.value };
            if (s.value === 'recusado') {
              const motivo = window.prompt('Motivo da recusa:');
              if (!motivo) { s.value = d.status; return; }
              corpo.observacao = motivo.trim();
            }
            try { await api('PUT', `/documentos/aluno/${sel.value}`, corpo); abrir(); } catch (e) { window.alert(e.message); }
          });
          return s;
        } },
      ], docs);
    });
  };
  sel.addEventListener('change', abrir);
  return [h('h1', {}, 'Entrega de documentos'), h('div', { class: 'painel' }, h('div', { class: 'campo' }, sel), area)];
}

// ---------- Eventos ----------
export async function eventos() {
  const lista = h('div');
  const inscritos = h('div');
  const verInscritos = (e) => carregar(inscritos, async () => {
    const rows = await api('GET', `/eventos/${e.id}/inscritos`);
    return h('div', { class: 'painel' }, h('h2', {}, `Inscritos – ${e.titulo}`), tabela([
      { titulo: 'Aluno', valor: (i) => `${i.matricula} – ${i.nome}` },
      { titulo: 'Inscrito em', valor: (i) => fmt.dataHora(i.inscrito_em) },
      { titulo: 'Presença', valor: (i) => (i.presente ? h('span', {}, selo('Presente', 'ok'), ` ${i.codigo_certificado}`)
        : h('button', { type: 'button', class: 'pequeno', onclick: async () => {
          try { await api('POST', `/eventos/${e.id}/presencas`, { alunoId: i.aluno_id }); verInscritos(e); } catch (err) { window.alert(err.message); }
        } }, 'Confirmar presença')) },
    ], rows, { vazio: 'Nenhum inscrito.' }));
  });
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Data', valor: (e) => fmt.data(e.data) },
    { titulo: 'Evento', valor: (e) => e.titulo },
    { titulo: 'Horas', num: true, valor: (e) => e.carga_horaria },
    { titulo: 'Inscritos', num: true, valor: (e) => `${e.inscritos}/${e.vagas}` },
    { titulo: '', valor: (e) => h('button', { type: 'button', class: 'secundario pequeno', onclick: () => verInscritos(e) }, 'Ver inscritos') },
  ], await api('GET', '/eventos')));
  atualizar();
  return [
    h('h1', {}, 'Eventos e certificados'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('h2', {}, 'Novo evento'), formulario({
        botao: 'Cadastrar evento',
        campos: [
          { nome: 'titulo', rotulo: 'Título', obrigatorio: true, max: 160 },
          { nome: 'local', rotulo: 'Local', max: 120 },
          { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true },
          { nome: 'cargaHoraria', rotulo: 'Carga horária (h)', tipo: 'number', obrigatorio: true, minimo: 1, maximo: 200 },
          { nome: 'vagas', rotulo: 'Vagas', tipo: 'number', obrigatorio: true, minimo: 1, maximo: 5000, valor: 100 },
          { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 2000 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/eventos', d); form.reset(); return 'Evento cadastrado.'; },
        depois: atualizar,
      })),
      h('div', { class: 'painel' }, h('h2', {}, 'Eventos'), lista)),
    h('p', {}, 'Ao confirmar a presença, o sistema gera um código aleatório de certificado. Qualquer pessoa pode validar o código, sem login, e só vê nome, evento, data e carga horária.'),
    inscritos,
  ];
}

// ---------- Rematrículas ----------
export async function rematriculas() {
  const r = await api('GET', '/rematricula/secretaria');
  const pct = r.totalAlunos ? Math.round((r.rematriculas.length / r.totalAlunos) * 100) : 0;
  return [
    h('h1', {}, `Rematrículas ${r.semestre}`),
    h('div', { class: 'painel' },
      h('div', { class: 'media' }, `${r.rematriculas.length} de ${r.totalAlunos}`), h('small', {}, `alunos ativos já rematriculados (${pct}%)`),
      tabela([
        { titulo: 'Aluno', valor: (x) => `${x.matricula} – ${x.nome}` },
        { titulo: 'Disciplinas', num: true, valor: (x) => x.disciplinas },
        { titulo: 'Confirmada em', valor: (x) => fmt.dataHora(x.confirmada_em) },
      ], r.rematriculas, { vazio: 'Nenhuma rematrícula ainda.' })),
  ];
}

// ---------- Avaliação institucional ----------
export async function avaliacao() {
  const r = await api('GET', '/avaliacao/resultados');
  const barra = (m) => {
    const preenchida = h('span');
    preenchida.style.width = `${Math.round((m / 5) * 100)}%`; // via CSSOM: permitido pela CSP (atributo style não é)
    return h('div', { class: 'nota-barra' }, h('i', {}, preenchida), h('b', {}, m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
  };
  return [
    h('h1', {}, 'Avaliação institucional'),
    h('p', {}, `Respostas anônimas. Turmas com menos de ${r.minimo} respostas ficam ocultas para não permitir identificar quem respondeu.`),
    r.turmas.length ? null : h('p', { class: 'vazio' }, 'Nenhuma resposta ainda.'),
    r.turmas.map((t) => h('div', { class: 'painel' },
      h('h2', {}, `${t.disciplina} – ${t.professor}`),
      h('p', {}, `${t.respostas} resposta(s)`),
      t.oculto ? mensagem('aviso', 'Resultado oculto até atingir o mínimo de respostas.') : [
        h('ol', { class: 'resultados' }, r.perguntas.map((p, i) => h('li', {}, h('span', {}, p), barra(t.medias[i])))),
        t.comentarios.length ? h('div', {}, h('h3', {}, 'Comentários'), h('ul', {}, t.comentarios.map((c) => h('li', {}, c)))) : null,
      ])),
  ];
}

// ---------- Links úteis ----------
export async function links() {
  const lista = h('div');
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Título', valor: (l) => l.titulo },
    { titulo: 'Endereço', valor: (l) => h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.url) },
    { titulo: '', valor: (l) => h('button', { type: 'button', class: 'perigo pequeno', onclick: async () => {
      if (!window.confirm(`Remover "${l.titulo}"?`)) return;
      try { await api('DELETE', `/links/${l.id}`); atualizar(); } catch (e) { window.alert(e.message); }
    } }, 'Remover') },
  ], await api('GET', '/links'), { vazio: 'Nenhum link.' }));
  atualizar();
  return [
    h('h1', {}, 'Links úteis'),
    h('p', {}, 'Aparecem na tela inicial de todos os usuários. Só são aceitos endereços https.'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('h2', {}, 'Novo link'), formulario({
        botao: 'Adicionar link',
        campos: [
          { nome: 'titulo', rotulo: 'Título', obrigatorio: true, max: 60 },
          { nome: 'url', rotulo: 'Endereço (https://)', tipo: 'url', obrigatorio: true, max: 500 },
          { nome: 'ordem', rotulo: 'Ordem', tipo: 'number', minimo: 0, maximo: 999 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/links', d); form.reset(); return 'Link adicionado.'; },
        depois: atualizar,
      })),
      h('div', { class: 'painel' }, lista)),
  ];
}

