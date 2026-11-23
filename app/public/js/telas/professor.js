import { api } from '../api.js';
import { h, tabela, formulario, fmt, DIAS, selo, carregar, erroBox, limpar, mensagem } from '../ui.js';
import { telaSenha } from './comum.js';
import { telaMensagens } from './mensagens.js';

async function seletorTurma(aoEscolher) {
  const turmas = await api('GET', '/professor/turmas');
  const sel = h('select', { 'aria-label': 'Turma' },
    h('option', { value: '' }, 'Selecione a turma...'),
    turmas.map((t) => h('option', { value: t.id }, `${t.disciplina} (${DIAS[t.dia_semana]} ${t.hora_inicio}) – ${t.semestre}`)));
  sel.addEventListener('change', () => { if (sel.value) aoEscolher(sel.value); });
  return h('div', { class: 'painel' }, h('label', {}, 'Turma'), h('div', {}, sel));
}

async function turmas() {
  const lista = await api('GET', '/professor/turmas');
  return [h('h1', {}, 'Minhas turmas'), h('div', { class: 'painel' }, tabela([
    { titulo: 'Disciplina', valor: (t) => `${t.codigo} – ${t.disciplina}` },
    { titulo: 'Semestre', valor: (t) => t.semestre },
    { titulo: 'Horário', valor: (t) => `${DIAS[t.dia_semana]} ${t.hora_inicio}–${t.hora_fim}` },
    { titulo: 'Sala', valor: (t) => t.sala || '-' },
    { titulo: 'Alunos', num: true, valor: (t) => t.qtd_alunos },
  ], lista, { vazio: 'Nenhuma turma atribuída.' }))];
}

async function notas() {
  const area = h('div');
  const abrir = (turmaId) => carregar(area, async () => {
    const [alunos, lancadas] = await Promise.all([
      api('GET', `/professor/turmas/${turmaId}/alunos`), api('GET', `/professor/turmas/${turmaId}/notas`)]);
    const avaliacoes = [...new Set(lancadas.map((n) => n.avaliacao))];
    const nota = (alunoId, av) => lancadas.find((n) => n.aluno_id === alunoId && n.avaliacao === av)?.nota;
    const inputs = alunos.map((a) => ({ a, input: h('input', { type: 'number', min: 0, max: 10, step: '0.1', 'aria-label': `Nota de ${a.nome}` }) }));
    const avIn = h('input', { type: 'text', maxlength: 60, required: true, placeholder: 'Ex.: Prova 2', list: 'avaliacoes-existentes' });
    const pesoIn = h('input', { type: 'number', min: 0.1, max: 10, step: '0.1', value: '1', required: true });
    avIn.addEventListener('change', () => inputs.forEach(({ a, input }) => { const v = nota(a.id, avIn.value); input.value = v ?? ''; }));
    const msg = h('div');
    const btn = h('button', { type: 'submit' }, 'Salvar notas');
    const form = h('form', {}, msg,
      h('datalist', { id: 'avaliacoes-existentes' }, avaliacoes.map((v) => h('option', { value: v }))),
      h('div', { class: 'linha-form' },
        h('div', { class: 'campo' }, h('label', {}, 'Avaliação'), avIn),
        h('div', { class: 'campo' }, h('label', {}, 'Peso'), pesoIn)),
      tabela([{ titulo: 'Aluno', valor: ({ a }) => `${a.nome} (${a.matricula})` }, { titulo: 'Nota (0 a 10)', valor: ({ input }) => input }], inputs, { vazio: 'Turma sem alunos.' }),
      h('div', { class: 'acoes' }, btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpar(msg);
      const notasEnviar = inputs.filter(({ input }) => input.value !== '').map(({ a, input }) => ({ alunoId: a.id, nota: Number(input.value) }));
      if (!notasEnviar.length) { msg.append(mensagem('erro', 'Informe ao menos uma nota')); return; }
      btn.disabled = true;
      try {
        await api('PUT', `/professor/turmas/${turmaId}/notas`, { avaliacao: avIn.value.trim(), peso: Number(pesoIn.value), notas: notasEnviar });
        abrir(turmaId);
      } catch (e) { msg.append(erroBox(e)); btn.disabled = false; }
    });
    return [
      h('div', { class: 'painel' }, h('h2', {}, 'Lançar ou corrigir notas'), h('p', {}, 'Para corrigir, digite o nome de uma avaliação já existente. Toda alteração fica registrada na auditoria.'), form),
      h('div', { class: 'painel' }, h('h2', {}, 'Notas lançadas'), tabela([
        { titulo: 'Avaliação', valor: (n) => n.avaliacao }, { titulo: 'Aluno', valor: (n) => n.nome },
        { titulo: 'Peso', num: true, valor: (n) => fmt.nota(n.peso) }, { titulo: 'Nota', num: true, valor: (n) => fmt.nota(n.nota) },
      ], lancadas, { vazio: 'Nenhuma nota lançada.' })),
    ];
  });
  return [h('h1', {}, 'Cadastro de notas'), await seletorTurma(abrir), area];
}

async function presencas() {
  const area = h('div');
  const abrir = (turmaId) => carregar(area, async () => {
    const [alunos, aulas, faltas] = await Promise.all([
      api('GET', `/professor/turmas/${turmaId}/alunos`),
      api('GET', `/professor/turmas/${turmaId}/aulas`),
      api('GET', `/professor/turmas/${turmaId}/faltas`)]);
    const checks = alunos.map((a) => ({ a, cb: h('input', { type: 'checkbox', checked: true, 'aria-label': `${a.nome} presente` }) }));
    const dataIn = h('input', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
    const conteudoIn = h('input', { type: 'text', required: true, maxlength: 500, placeholder: 'Conteúdo da aula' });
    const msg = h('div');
    const btn = h('button', { type: 'submit' }, 'Registrar chamada');
    const form = h('form', {}, msg,
      h('div', { class: 'linha-form' },
        h('div', { class: 'campo' }, h('label', {}, 'Data'), dataIn),
        h('div', { class: 'campo' }, h('label', {}, 'Conteúdo'), conteudoIn)),
      tabela([{ titulo: 'Presente', valor: ({ cb }) => cb }, { titulo: 'Aluno', valor: ({ a }) => a.nome }], checks, { vazio: 'Turma sem alunos.' }),
      h('div', { class: 'acoes' }, btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpar(msg);
      btn.disabled = true;
      try {
        await api('POST', `/professor/turmas/${turmaId}/aulas`, {
          data: dataIn.value, conteudo: conteudoIn.value.trim(), presencas: checks.map(({ a, cb }) => ({ alunoId: a.id, presente: cb.checked })),
        });
        abrir(turmaId);
      } catch (e) { msg.append(erroBox(e)); btn.disabled = false; }
    });
    const justificar = async (f) => {
      const texto = window.prompt(`Justificativa da falta de ${f.nome} em ${fmt.data(f.data)}:`);
      if (!texto) return;
      try { await api('PATCH', `/professor/presencas/${f.id}/justificativa`, { justificativa: texto.trim() }); abrir(turmaId); }
      catch (e) { window.alert(e.message); }
    };
    return [
      h('div', { class: 'grade-2' },
        h('div', { class: 'painel' }, h('h2', {}, 'Nova chamada'), form),
        h('div', { class: 'painel' }, h('h2', {}, 'Aulas registradas'), tabela([
          { titulo: 'Data', valor: (a) => fmt.data(a.data) }, { titulo: 'Conteúdo', valor: (a) => a.conteudo },
          { titulo: 'Presentes', num: true, valor: (a) => a.presentes }, { titulo: 'Ausentes', num: true, valor: (a) => a.ausentes },
        ], aulas, { vazio: 'Nenhuma aula registrada.' }))),
      h('div', { class: 'painel' }, h('h2', {}, 'Faltas'), tabela([
        { titulo: 'Data', valor: (f) => fmt.data(f.data) }, { titulo: 'Aluno', valor: (f) => f.nome },
        { titulo: 'Situação', valor: (f) => (f.justificada ? selo('Justificada', 'ok') : selo('Não justificada', 'aviso')) },
        { titulo: 'Justificativa', valor: (f) => f.justificativa || '-' },
        { titulo: '', valor: (f) => (f.justificada ? '' : h('button', { class: 'secundario pequeno', type: 'button', onclick: () => justificar(f) }, 'Justificar')) },
      ], faltas, { vazio: 'Nenhuma falta.' })),
    ];
  });
  return [h('h1', {}, 'Presenças e faltas'), await seletorTurma(abrir), area];
}

async function planos() {
  const area = h('div');
  const lista = await api('GET', '/professor/planos');
  const sel = h('select', { 'aria-label': 'Disciplina' }, h('option', { value: '' }, 'Selecione a disciplina...'),
    lista.map((d) => h('option', { value: d.id }, `${d.codigo} – ${d.nome}`)));
  sel.addEventListener('change', () => {
    limpar(area);
    const d = lista.find((x) => x.id === sel.value);
    if (!d) return;
    area.append(h('div', { class: 'painel' },
      h('p', {}, d.plano_atualizado_em ? `Última atualização: ${fmt.dataHora(d.plano_atualizado_em)}` : 'Plano ainda não preenchido.'),
      formulario({
        botao: 'Salvar plano de ensino',
        campos: [
          ['ementa', 'Ementa'], ['objetivos', 'Objetivos'], ['conteudoProgramatico', 'Conteúdo programático', 'conteudo_programatico'],
          ['metodologia', 'Metodologia'], ['avaliacao', 'Avaliação'], ['bibliografia', 'Bibliografia'],
        ].map(([nome, rotulo, col]) => ({ nome, rotulo, tipo: 'textarea', obrigatorio: true, max: 6000, valor: d[col || nome] || '' })),
        aoEnviar: async (dados) => {
          await api('PUT', `/professor/planos/${d.id}`, dados);
          Object.assign(d, { ...dados, conteudo_programatico: dados.conteudoProgramatico });
          return 'Plano de ensino salvo.';
        },
      })));
  });
  return [h('h1', {}, 'Plano de ensino'), h('div', { class: 'painel' }, h('label', {}, 'Disciplina'), h('div', {}, sel)), area];
}

async function materiais() {
  const lista = h('div');
  const turmasProf = await api('GET', '/professor/turmas');
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Disciplina', valor: (m) => m.disciplina },
    { titulo: 'Material', valor: (m) => (m.url ? h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, m.titulo) : m.titulo) },
    { titulo: 'Publicado', valor: (m) => fmt.data(m.criado_em) },
    { titulo: '', valor: (m) => h('button', { type: 'button', class: 'perigo pequeno', onclick: async () => {
      if (!window.confirm(`Remover "${m.titulo}"?`)) return;
      try { await api('DELETE', `/materiais/${m.id}`); atualizar(); } catch (e) { window.alert(e.message); }
    } }, 'Remover') },
  ], await api('GET', '/materiais'), { vazio: 'Nenhum material publicado.' }));
  atualizar();
  return [
    h('h1', {}, 'Material de apoio'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('h2', {}, 'Publicar material'), formulario({
        botao: 'Publicar',
        campos: [
          { nome: 'turmaId', rotulo: 'Turma', tipo: 'select', obrigatorio: true, opcoes: turmasProf.map((t) => ({ valor: t.id, rotulo: `${t.disciplina} – ${t.semestre}` })) },
          { nome: 'titulo', rotulo: 'Título', obrigatorio: true, max: 120 },
          { nome: 'url', rotulo: 'Link (https://)', tipo: 'url', max: 500 },
          { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 2000 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/materiais', d); form.reset(); return 'Material publicado.'; },
        depois: atualizar,
      })),
      h('div', { class: 'painel' }, h('h2', {}, 'Publicados'), lista)),
  ];
}

export const menuProfessor = [
  { id: 'notas', rotulo: 'Cadastro de notas', grupo: 'Operações', icone: 'notas', tela: notas },
  { id: 'presencas', rotulo: 'Presenças e faltas', grupo: 'Operações', icone: 'presencas', tela: presencas },
  { id: 'planos', rotulo: 'Plano de ensino', grupo: 'Operações', icone: 'planos', tela: planos },
  { id: 'materiais', rotulo: 'Material de apoio', grupo: 'Operações', icone: 'material', tela: materiais },
  { id: 'mensagens', rotulo: 'Caixa de mensagens', grupo: 'Operações', icone: 'mensagens', tela: telaMensagens('professor'), contador: 'mensagens' },
  { id: 'senha', rotulo: 'Alterar senha', grupo: 'Operações', icone: 'senha', tela: async () => telaSenha() },
  { id: 'turmas', rotulo: 'Minhas turmas', grupo: 'Consultas', icone: 'turmas', tela: turmas },
];
