import { api } from '../api.js';
import { h, tabela, formulario, fmt, DIAS, selo, seloRequerimento, seloParcela, carregar } from '../ui.js';
import { telaSenha } from './comum.js';
import { telaMensagens } from './mensagens.js';
import { telaBasquete } from './basquete.js';
import * as P from './aluno-portal.js';

async function horarios() {
  const aulas = await api('GET', '/aluno/horarios');
  const hoje = ((new Date().getDay() + 6) % 7) + 1; // 1 = segunda
  return [
    h('h1', {}, 'Quadro de horários'),
    aulas.length ? h('p', {}, `Semestre ${aulas[0].semestre}`) : null,
    h('div', { class: 'semana' }, [1, 2, 3, 4, 5, 6].map((d) => h('div', { class: `dia ${d === hoje ? 'hoje' : ''}` },
      h('h3', {}, DIAS[d]),
      aulas.filter((a) => a.dia_semana === d).map((a) => h('div', { class: 'aula' },
        h('span', { class: 'hora' }, `${a.hora_inicio}–${a.hora_fim}`),
        h('strong', {}, a.disciplina),
        h('div', {}, a.professor),
        a.sala ? h('div', {}, a.sala) : null))))),
    aulas.length ? null : h('p', { class: 'vazio' }, 'Você ainda não está matriculado em turmas.'),
  ];
}

async function notas() {
  const turmas = await api('GET', '/aluno/notas');
  return [
    h('h1', {}, 'Conceitos e notas'),
    turmas.length ? null : h('p', { class: 'vazio' }, 'Nenhuma disciplina no semestre.'),
    h('div', { class: 'grade-2' }, turmas.map((t) => h('div', { class: 'painel' },
      h('h2', {}, t.disciplina),
      h('div', { class: 'linha-form' },
        h('div', {}, h('div', { class: 'media' }, t.media === null ? '-' : fmt.nota(t.media)), h('small', {}, 'Média ponderada')),
        h('div', {}, h('div', { class: 'media' }, t.conceito), h('small', {}, 'Conceito')),
        h('div', {}, selo(t.situacao, t.media === null ? '' : t.media >= 7 ? 'ok' : 'alerta'))),
      tabela([
        { titulo: 'Avaliação', valor: (a) => a.avaliacao },
        { titulo: 'Peso', num: true, valor: (a) => fmt.nota(a.peso) },
        { titulo: 'Nota', num: true, valor: (a) => fmt.nota(a.nota) },
      ], t.avaliacoes, { vazio: 'Sem notas lançadas.' })))),
  ];
}

async function frequencia() {
  const linhas = await api('GET', '/aluno/frequencia');
  return [
    h('h1', {}, 'Controle de faltas'),
    h('p', {}, 'Calculado a partir das chamadas registradas pelos professores. Faltas justificadas contam como presença. Mínimo exigido: 75%.'),
    h('div', { class: 'painel' }, tabela([
      { titulo: 'Disciplina', valor: (l) => l.disciplina },
      { titulo: 'Aulas', num: true, valor: (l) => l.total_aulas },
      { titulo: 'Presenças', num: true, valor: (l) => l.presencas },
      { titulo: 'Faltas', num: true, valor: (l) => l.faltas },
      { titulo: 'Justificadas', num: true, valor: (l) => l.faltas_justificadas },
      { titulo: 'Frequência', valor: (l) => h('div', {}, `${l.percentual.toLocaleString('pt-BR')}%`,
        h('div', { class: `barra ${l.percentual < 75 ? 'baixa' : ''}` }, h('div', { style: null, 'data-p': l.percentual }))) },
      { titulo: 'Situação', valor: (l) => selo(l.situacao, l.percentual >= 75 ? 'ok' : 'alerta') },
    ], linhas)),
  ];
}

function ajustarBarras(raiz) {
  raiz.querySelectorAll('[data-p]').forEach((el) => { el.style.width = `${Math.min(100, Number(el.dataset.p))}%`; });
}

async function requerimentos() {
  const lista = h('div');
  const tipos = await api('GET', '/aluno/tipos-requerimento');
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Data', valor: (r) => fmt.data(r.criado_em) },
    { titulo: 'Tipo', valor: (r) => r.tipo },
    { titulo: 'Descrição', valor: (r) => r.descricao },
    { titulo: 'Situação', valor: (r) => seloRequerimento(r.status) },
    { titulo: 'Resposta', valor: (r) => r.resposta || '-' },
  ], await api('GET', '/aluno/requerimentos'), { vazio: 'Você ainda não abriu requerimentos.' }));
  atualizar();
  return [
    h('h1', {}, 'Requerimentos'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('h2', {}, 'Novo requerimento'), formulario({
        botao: 'Enviar requerimento',
        campos: [
          { nome: 'tipoId', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: tipos.map((t) => ({ valor: t.id, rotulo: `${t.nome} (prazo ${t.prazo_dias} dias)` })) },
          { nome: 'descricao', rotulo: 'Descreva o pedido', tipo: 'textarea', obrigatorio: true, max: 2000 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/aluno/requerimentos', d); form.reset(); return 'Requerimento enviado.'; },
        depois: atualizar,
      })),
      h('div', { class: 'painel' }, h('h2', {}, 'Meus requerimentos'), lista)),
  ];
}

async function financeiro() {
  const parcelas = await api('GET', '/aluno/parcelas');
  const aberto = parcelas.filter((p) => p.status === 'aberta').reduce((s, p) => s + Number(p.valor), 0);
  return [
    h('h1', {}, 'Financeiro'),
    h('div', { class: 'painel' },
      h('div', { class: 'media' }, fmt.moeda(aberto)), h('small', {}, 'Total em aberto'),
      tabela([
        { titulo: 'Parcela', num: true, valor: (p) => p.numero },
        { titulo: 'Competência', valor: (p) => p.competencia },
        { titulo: 'Vencimento', valor: (p) => fmt.data(p.vencimento) },
        { titulo: 'Valor', num: true, valor: (p) => fmt.moeda(p.valor) },
        { titulo: 'Situação', valor: (p) => seloParcela(p) },
        { titulo: 'Pago em', valor: (p) => fmt.data(p.pago_em) },
      ], parcelas, { vazio: 'Nenhuma parcela gerada.' })),
  ];
}

async function planos() {
  const lista = await api('GET', '/aluno/planos');
  const secao = (t, v) => (v ? h('section', {}, h('h4', {}, t), h('p', {}, v)) : null);
  return [
    h('h1', {}, 'Planos de ensino'),
    lista.length ? null : h('p', { class: 'vazio' }, 'Nenhuma disciplina no semestre.'),
    lista.map((d) => h('div', { class: 'painel plano' },
      h('h2', {}, `${d.codigo} – ${d.nome}`), h('p', {}, `Carga horária: ${d.carga_horaria} h`),
      secao('Ementa', d.ementa), secao('Objetivos', d.objetivos), secao('Conteúdo programático', d.conteudo_programatico),
      secao('Metodologia', d.metodologia), secao('Avaliação', d.avaliacao), secao('Bibliografia', d.bibliografia))),
  ];
}

async function dados() {
  const p = await api('GET', '/aluno/perfil');
  const item = (t, v) => [h('dt', {}, t), h('dd', {}, v || '-')];
  return [
    h('h1', {}, 'Dados cadastrais'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('dl', { class: 'dados' },
        item('Nome', p.nome), item('E-mail', p.email), item('Matrícula', p.matricula), item('CPF', p.cpf),
        item('Curso', p.curso), item('Nascimento', fmt.data(p.data_nascimento)), item('Telefone', p.telefone), item('Endereço', p.endereco)),
      h('p', {}, 'Para corrigir nome, CPF ou curso, abra um requerimento.')),
      h('div', { class: 'painel' }, h('h2', {}, 'Atualizar contato'), formulario({
        botao: 'Salvar contato',
        campos: [
          { nome: 'telefone', rotulo: 'Telefone', valor: p.telefone, max: 20 },
          { nome: 'endereco', rotulo: 'Endereço', valor: p.endereco, max: 200 },
        ],
        aoEnviar: async (d) => { await api('PATCH', '/aluno/perfil', d); return 'Contato atualizado.'; },
      }))),
  ];
}

export const menuAluno = [
  { id: 'bolsas', rotulo: 'Solicitação de bolsa de estudos', grupo: 'Operações', icone: 'bolsa', tela: P.bolsas },
  { id: 'dados', rotulo: 'Dados cadastrais', grupo: 'Operações', icone: 'dados', tela: dados },
  { id: 'mensagens', rotulo: 'Caixa de mensagens', grupo: 'Operações', icone: 'mensagens', tela: telaMensagens('aluno'), contador: 'mensagens' },
  { id: 'senha', rotulo: 'Alterar senha', grupo: 'Operações', icone: 'senha', tela: async () => telaSenha() },
  { id: 'requerimentos', rotulo: 'Requerimentos', grupo: 'Operações', icone: 'requerimentos', tela: requerimentos },
  { id: 'materiais', rotulo: 'Material de apoio', grupo: 'Operações', icone: 'material', tela: P.materiais },
  { id: 'rematricula', rotulo: 'Rematrícula 2027/1', grupo: 'Operações', icone: 'rematricula', tela: P.rematricula },
  { id: 'avaliacao', rotulo: 'Avaliação institucional', grupo: 'Operações', icone: 'avaliacao', tela: P.avaliacao },
  { id: 'financeiro', rotulo: 'Parcelas', grupo: 'Consultas e relatórios', icone: 'financeiro', tela: financeiro },
  { id: 'horarios', rotulo: 'Quadro de horários', grupo: 'Consultas e relatórios', icone: 'horarios', tela: horarios },
  { id: 'notas', rotulo: 'Notas e conceitos', grupo: 'Consultas e relatórios', icone: 'notas', tela: notas },
  { id: 'frequencia', rotulo: 'Faltas e frequência', grupo: 'Consultas e relatórios', icone: 'frequencia', tela: frequencia, depois: ajustarBarras },
  { id: 'atividades', rotulo: 'Atividades complementares', grupo: 'Consultas e relatórios', icone: 'atividades', tela: P.atividades },
  { id: 'planos', rotulo: 'Plano de ensino', grupo: 'Consultas e relatórios', icone: 'planos', tela: planos },
  { id: 'contrato', rotulo: 'Contrato de prestação de serviços', grupo: 'Consultas e relatórios', icone: 'contrato', tela: P.contrato },
  { id: 'eventos', rotulo: 'Eventos e certificados', grupo: 'Consultas e relatórios', icone: 'certificado', tela: P.eventos },
  { id: 'documentos', rotulo: 'Entrega de documentos', grupo: 'Consultas e relatórios', icone: 'documentos', tela: P.documentos },
  { id: 'informe', rotulo: 'Informe de pagamentos (IR)', grupo: 'Consultas e relatórios', icone: 'informe', tela: P.informe },
  { id: 'historico', rotulo: 'Histórico escolar', grupo: 'Consultas e relatórios', icone: 'historico', tela: P.historico },
  { id: 'basquete', rotulo: 'Arremesso UNIDAVI', grupo: 'Espaço do aluno', icone: 'basquete', tela: telaBasquete, destaque: true },
];
