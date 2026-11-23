import { api } from '../api.js';
import { h, tabela, formulario, fmt, selo, seloRequerimento, seloParcela, carregar, erroBox, limpar, mensagem } from '../ui.js';
import { telaSenha } from './comum.js';
import { telaMensagens } from './mensagens.js';
import * as S from './secretaria-portal.js';

function avisoSenha(titulo, senha) {
  return h('div', { class: 'msg msg-aviso', role: 'status' },
    h('p', {}, titulo),
    h('p', {}, 'Senha temporária: ', h('span', { class: 'destaque-senha' }, senha)),
    h('p', {}, 'Ela aparece só agora. Entregue ao aluno por canal seguro; a troca é obrigatória no primeiro acesso.'));
}

async function alunos() {
  const lista = h('div');
  const turmas = await api('GET', '/secretaria/turmas');
  const buscaIn = h('input', { type: 'search', placeholder: 'Nome, matrícula ou e-mail', maxlength: 80, 'aria-label': 'Buscar aluno' });
  const avisos = h('div');

  const acoesAluno = (a) => {
    const selTurma = h('select', { class: 'pequeno', 'aria-label': 'Turma' }, h('option', { value: '' }, 'Matricular em turma...'),
      turmas.map((t) => h('option', { value: t.id }, `${t.disciplina} – ${t.semestre}`)));
    selTurma.addEventListener('change', async () => {
      if (!selTurma.value) return;
      limpar(avisos);
      try { await api('POST', `/secretaria/alunos/${a.id}/turmas`, { turmaId: selTurma.value }); avisos.append(mensagem('ok', `${a.nome} matriculado na turma.`)); }
      catch (e) { avisos.append(erroBox(e)); }
      selTurma.value = '';
    });
    return h('div', { class: 'acoes' }, selTurma,
      h('button', { type: 'button', class: 'secundario pequeno', onclick: async () => {
        if (!window.confirm(`Gerar nova senha temporária para ${a.nome}?`)) return;
        limpar(avisos);
        try { const r = await api('POST', `/secretaria/alunos/${a.id}/redefinir-senha`); avisos.append(avisoSenha(`Senha redefinida para ${a.nome}.`, r.senhaTemporaria)); }
        catch (e) { avisos.append(erroBox(e)); }
      } }, 'Redefinir senha'),
      h('button', { type: 'button', class: `${a.ativo ? 'perigo' : 'secundario'} pequeno`, onclick: async () => {
        limpar(avisos);
        try { await api('PATCH', `/secretaria/alunos/${a.id}/status`, { ativo: !a.ativo }); buscar(); }
        catch (e) { avisos.append(erroBox(e)); }
      } }, a.ativo ? 'Desativar acesso' : 'Ativar acesso'));
  };

  const buscar = () => carregar(lista, async () => tabela([
    { titulo: 'Matrícula', valor: (a) => a.matricula },
    { titulo: 'Nome', valor: (a) => a.nome },
    { titulo: 'E-mail', valor: (a) => a.email },
    { titulo: 'CPF', valor: (a) => a.cpf },
    { titulo: 'Acesso', valor: (a) => (a.ativo ? selo('Ativo', 'ok') : selo('Inativo', 'alerta')) },
    { titulo: 'Ações', valor: acoesAluno },
  ], await api('GET', `/secretaria/alunos?busca=${encodeURIComponent(buscaIn.value.trim())}`), { vazio: 'Nenhum aluno encontrado.' }));
  buscaIn.addEventListener('input', () => { clearTimeout(buscaIn.t); buscaIn.t = setTimeout(buscar, 300); });
  buscar();

  return [
    h('h1', {}, 'Alunos e matrícula'),
    avisos,
    h('div', { class: 'painel' }, h('h2', {}, 'Cadastrar aluno'), formulario({
      botao: 'Cadastrar aluno',
      classe: 'grade-campos',
      campos: [
        { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, max: 120 },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, max: 160 },
        { nome: 'cpf', rotulo: 'CPF', obrigatorio: true, max: 14, placeholder: '000.000.000-00' },
        { nome: 'matricula', rotulo: 'Matrícula', obrigatorio: true, max: 20 },
        { nome: 'curso', rotulo: 'Curso', obrigatorio: true, max: 120, valor: 'Sistemas de Informação' },
        { nome: 'dataNascimento', rotulo: 'Data de nascimento', tipo: 'date' },
        { nome: 'telefone', rotulo: 'Telefone', max: 20 },
        { nome: 'endereco', rotulo: 'Endereço', max: 200 },
      ],
      aoEnviar: async (d, form) => {
        const r = await api('POST', '/secretaria/alunos', d);
        form.reset();
        buscar();
        return avisoSenha(`Aluno ${d.nome} cadastrado.`, r.senhaTemporaria);
      },
    })),
    h('div', { class: 'painel' }, h('h2', {}, 'Alunos'), h('div', { class: 'campo' }, buscaIn), lista),
  ];
}

async function financeiro() {
  const lista = h('div');
  const alunosLista = await api('GET', '/secretaria/alunos');
  const filtroAluno = h('select', { 'aria-label': 'Filtrar por aluno' }, h('option', { value: '' }, 'Todos os alunos'),
    alunosLista.map((a) => h('option', { value: a.id }, `${a.matricula} – ${a.nome}`)));
  const filtroStatus = h('select', { 'aria-label': 'Filtrar por situação' }, h('option', { value: '' }, 'Todas as situações'),
    [['aberta', 'Em aberto'], ['paga', 'Pagas'], ['cancelada', 'Canceladas']].map(([v, t]) => h('option', { value: v }, t)));

  const mudar = async (p, acao) => {
    try { await api('PATCH', `/secretaria/parcelas/${p.id}/${acao}`); atualizar(); } catch (e) { window.alert(e.message); }
  };
  const atualizar = () => carregar(lista, async () => {
    const qs = new URLSearchParams();
    if (filtroAluno.value) qs.set('alunoId', filtroAluno.value);
    if (filtroStatus.value) qs.set('status', filtroStatus.value);
    return tabela([
      { titulo: 'Aluno', valor: (p) => `${p.matricula} – ${p.aluno}` },
      { titulo: 'Nº', num: true, valor: (p) => p.numero },
      { titulo: 'Competência', valor: (p) => p.competencia },
      { titulo: 'Vencimento', valor: (p) => fmt.data(p.vencimento) },
      { titulo: 'Valor', num: true, valor: (p) => fmt.moeda(p.valor) },
      { titulo: 'Situação', valor: seloParcela },
      { titulo: 'Ações', valor: (p) => (p.status !== 'aberta' ? '' : h('div', { class: 'acoes' },
        h('button', { type: 'button', class: 'pequeno', onclick: () => mudar(p, 'pagamento') }, 'Registrar pagamento'),
        h('button', { type: 'button', class: 'perigo pequeno', onclick: () => window.confirm('Cancelar esta parcela?') && mudar(p, 'cancelamento') }, 'Cancelar'))) },
    ], await api('GET', `/secretaria/parcelas?${qs}`), { vazio: 'Nenhuma parcela encontrada.' });
  });
  filtroAluno.addEventListener('change', atualizar);
  filtroStatus.addEventListener('change', atualizar);
  atualizar();

  return [
    h('h1', {}, 'Financeiro'),
    h('div', { class: 'painel' }, h('h2', {}, 'Gerar parcelas'), formulario({
      botao: 'Gerar parcelas',
      campos: [
        { nome: 'alunoId', rotulo: 'Aluno', tipo: 'select', obrigatorio: true, opcoes: alunosLista.map((a) => ({ valor: a.id, rotulo: `${a.matricula} – ${a.nome}` })) },
        { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'number', obrigatorio: true, minimo: 1, maximo: 60, valor: 6 },
        { nome: 'valor', rotulo: 'Valor de cada parcela (R$)', tipo: 'number', obrigatorio: true, minimo: 0.01, passo: '0.01' },
        { nome: 'primeiroVencimento', rotulo: 'Primeiro vencimento', tipo: 'date', obrigatorio: true },
      ],
      aoEnviar: async (d) => (await api('POST', '/secretaria/parcelas/gerar', d)).mensagem,
      depois: atualizar,
    })),
    h('div', { class: 'painel' }, h('h2', {}, 'Parcelas'), h('div', { class: 'linha-form' }, filtroAluno, filtroStatus), lista),
  ];
}

async function requerimentos() {
  const lista = h('div');
  const filtro = h('select', { 'aria-label': 'Filtrar por situação' }, h('option', { value: '' }, 'Todas as situações'),
    [['aberto', 'Abertos'], ['em_analise', 'Em análise'], ['deferido', 'Deferidos'], ['indeferido', 'Indeferidos']].map(([v, t]) => h('option', { value: v }, t)));
  const responder = (r) => {
    const destino = h('div');
    destino.append(formulario({
      botao: 'Salvar resposta',
      campos: [
        { nome: 'status', rotulo: 'Situação', tipo: 'select', obrigatorio: true, opcoes: [
          { valor: 'em_analise', rotulo: 'Em análise' }, { valor: 'deferido', rotulo: 'Deferido' }, { valor: 'indeferido', rotulo: 'Indeferido' }] },
        { nome: 'resposta', rotulo: 'Resposta ao aluno', tipo: 'textarea', max: 2000 },
      ],
      aoEnviar: async (d) => { await api('PATCH', `/secretaria/requerimentos/${r.id}`, d); atualizar(); },
    }));
    return destino;
  };
  const atualizar = () => carregar(lista, async () => {
    const linhas = await api('GET', `/secretaria/requerimentos${filtro.value ? `?status=${filtro.value}` : ''}`);
    return tabela([
      { titulo: 'Data', valor: (r) => fmt.data(r.criado_em) },
      { titulo: 'Aluno', valor: (r) => `${r.matricula} – ${r.aluno}` },
      { titulo: 'Tipo', valor: (r) => r.tipo },
      { titulo: 'Descrição', valor: (r) => r.descricao },
      { titulo: 'Situação', valor: (r) => seloRequerimento(r.status) },
      { titulo: 'Resposta', valor: (r) => (['aberto', 'em_analise'].includes(r.status)
        ? h('details', {}, h('summary', {}, 'Responder'), responder(r)) : (r.resposta || '-')) },
    ], linhas, { vazio: 'Nenhum requerimento.' });
  });
  filtro.addEventListener('change', atualizar);
  atualizar();
  return [h('h1', {}, 'Requerimentos dos alunos'), h('div', { class: 'painel' }, h('div', { class: 'campo' }, filtro), lista)];
}

async function tipos() {
  const lista = h('div');
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Nome', valor: (t) => t.nome },
    { titulo: 'Descrição', valor: (t) => t.descricao },
    { titulo: 'Prazo', num: true, valor: (t) => `${t.prazo_dias} dias` },
    { titulo: 'Situação', valor: (t) => (t.ativo ? selo('Ativo', 'ok') : selo('Inativo')) },
    { titulo: '', valor: (t) => h('button', { type: 'button', class: 'secundario pequeno', onclick: async () => {
      try { await api('PATCH', `/secretaria/tipos-requerimento/${t.id}`, { ativo: !t.ativo }); atualizar(); } catch (e) { window.alert(e.message); }
    } }, t.ativo ? 'Desativar' : 'Ativar') },
  ], await api('GET', '/secretaria/tipos-requerimento')));
  atualizar();
  return [
    h('h1', {}, 'Tipos de requerimento'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('h2', {}, 'Novo tipo'), formulario({
        botao: 'Cadastrar tipo',
        campos: [
          { nome: 'nome', rotulo: 'Nome', obrigatorio: true, max: 80 },
          { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', obrigatorio: true, max: 500 },
          { nome: 'prazoDias', rotulo: 'Prazo de resposta (dias)', tipo: 'number', obrigatorio: true, minimo: 1, maximo: 90, valor: 5 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/secretaria/tipos-requerimento', d); form.reset(); return 'Tipo cadastrado.'; },
        depois: atualizar,
      })),
      h('div', { class: 'painel' }, h('h2', {}, 'Tipos cadastrados'), lista)),
  ];
}

export const menuSecretaria = [
  { id: 'alunos', rotulo: 'Alunos e matrícula', grupo: 'Operações', icone: 'alunos', tela: alunos },
  { id: 'financeiro', rotulo: 'Financeiro', grupo: 'Operações', icone: 'financeiro', tela: financeiro },
  { id: 'requerimentos', rotulo: 'Requerimentos', grupo: 'Operações', icone: 'requerimentos', tela: requerimentos },
  { id: 'bolsas', rotulo: 'Bolsas de estudo', grupo: 'Operações', icone: 'bolsa', tela: S.bolsas },
  { id: 'atividades', rotulo: 'Atividades complementares', grupo: 'Operações', icone: 'atividades', tela: S.atividades },
  { id: 'documentos', rotulo: 'Entrega de documentos', grupo: 'Operações', icone: 'documentos', tela: S.documentos },
  { id: 'eventos', rotulo: 'Eventos e certificados', grupo: 'Operações', icone: 'certificado', tela: S.eventos },
  { id: 'mensagens', rotulo: 'Caixa de mensagens', grupo: 'Operações', icone: 'mensagens', tela: telaMensagens('secretaria'), contador: 'mensagens' },
  { id: 'rematriculas', rotulo: 'Rematrículas 2027/1', grupo: 'Relatórios', icone: 'rematricula', tela: S.rematriculas },
  { id: 'avaliacao', rotulo: 'Avaliação institucional', grupo: 'Relatórios', icone: 'avaliacao', tela: S.avaliacao },
  { id: 'tipos', rotulo: 'Tipos de requerimento', grupo: 'Cadastros', icone: 'tipos', tela: tipos },
  { id: 'links', rotulo: 'Links úteis', grupo: 'Cadastros', icone: 'link', tela: S.links },
  { id: 'senha', rotulo: 'Alterar senha', grupo: 'Cadastros', icone: 'senha', tela: async () => telaSenha() },
];
