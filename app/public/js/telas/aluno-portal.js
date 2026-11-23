import { api } from '../api.js';
import { h, tabela, formulario, fmt, DIAS, selo, carregar, erroBox, limpar, mensagem } from '../ui.js';

const imprimir = () => h('button', { type: 'button', class: 'secundario', onclick: () => window.print() }, 'Imprimir');

const STATUS_BOLSA = { enviada: ['Enviada', 'aviso'], em_analise: ['Em análise', ''], deferida: ['Deferida', 'ok'], indeferida: ['Indeferida', 'alerta'] };
const STATUS_ATIV = { enviada: ['Em validação', 'aviso'], aprovada: ['Aprovada', 'ok'], reprovada: ['Reprovada', 'alerta'] };
const STATUS_DOC = { pendente: ['Pendente', 'alerta'], entregue: ['Entregue, em conferência', 'aviso'], aprovado: ['Aprovado', 'ok'], recusado: ['Recusado', 'alerta'] };
const CATEGORIAS = [['ensino', 'Ensino'], ['pesquisa', 'Pesquisa'], ['extensao', 'Extensão'], ['cultural', 'Cultural'], ['profissional', 'Profissional']];
const seloDe = (mapa, s) => { const [t, c] = mapa[s] || [s, '']; return selo(t, c); };

// ---------- Bolsas ----------
export async function bolsas() {
  const { semestre, programas } = await api('GET', '/bolsas/programas');
  const lista = h('div');
  const atualizar = () => carregar(lista, async () => tabela([
    { titulo: 'Programa', valor: (b) => b.programa_nome },
    { titulo: 'Semestre', valor: (b) => b.semestre },
    { titulo: 'Situação', valor: (b) => seloDe(STATUS_BOLSA, b.status) },
    { titulo: 'Bolsa', num: true, valor: (b) => (b.percentual ? `${Number(b.percentual)}%` : '-') },
    { titulo: 'Resposta', valor: (b) => b.resposta || '-' },
  ], await api('GET', '/bolsas/minhas'), { vazio: 'Nenhuma solicitação enviada.' }));
  atualizar();
  return [
    h('h1', {}, 'Solicitação de bolsa de estudos'),
    h('p', {}, `Inscrições abertas para ${semestre}. A secretaria analisa por ordem de renda per capita. Seus dados de renda só são vistos pela comissão de bolsas.`),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, h('h2', {}, 'Nova solicitação'), formulario({
        botao: 'Enviar solicitação',
        campos: [
          { nome: 'programa', rotulo: 'Programa', tipo: 'select', obrigatorio: true, opcoes: programas.map((p) => ({ valor: p.id, rotulo: p.nome })) },
          { nome: 'rendaFamiliar', rotulo: 'Renda bruta mensal da família (R$)', tipo: 'number', obrigatorio: true, minimo: 0, passo: '0.01' },
          { nome: 'membrosFamilia', rotulo: 'Pessoas que vivem dessa renda', tipo: 'number', obrigatorio: true, minimo: 1, maximo: 20, valor: 1 },
          { nome: 'justificativa', rotulo: 'Por que você precisa da bolsa?', tipo: 'textarea', obrigatorio: true, max: 3000 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/bolsas', d); form.reset(); return 'Solicitação enviada.'; },
        depois: atualizar,
      })),
      h('div', { class: 'painel' }, h('h2', {}, 'Minhas solicitações'), lista)),
  ];
}

// ---------- Material de apoio ----------
export async function materiais() {
  const lista = await api('GET', '/materiais');
  const porDisciplina = new Map();
  for (const m of lista) {
    if (!porDisciplina.has(m.disciplina)) porDisciplina.set(m.disciplina, []);
    porDisciplina.get(m.disciplina).push(m);
  }
  return [
    h('h1', {}, 'Material de apoio'),
    lista.length ? null : h('p', { class: 'vazio' }, 'Os professores ainda não publicaram materiais.'),
    [...porDisciplina.entries()].map(([disc, itens]) => h('section', { class: 'painel' },
      h('h2', {}, disc),
      h('ul', { class: 'lista-materiais' }, itens.map((m) => h('li', {},
        m.url ? h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, m.titulo) : h('strong', {}, m.titulo),
        m.descricao ? h('p', {}, m.descricao) : null,
        h('small', {}, `${m.professor} · ${fmt.data(m.criado_em)}`)))))),
  ];
}

// ---------- Rematrícula ----------
export async function rematricula() {
  const r = await api('GET', '/rematricula');
  if (r.rematricula) {
    const minhas = r.ofertas.filter((o) => r.rematricula.turmas.includes(o.id));
    return [
      h('h1', {}, `Rematrícula ${r.semestre}`),
      mensagem('ok', `Rematrícula confirmada em ${fmt.dataHora(r.rematricula.confirmada_em)}.`),
      h('div', { class: 'painel' }, tabela([
        { titulo: 'Disciplina', valor: (o) => o.disciplina },
        { titulo: 'Horário', valor: (o) => `${DIAS[o.dia_semana]} ${o.hora_inicio}–${o.hora_fim}` },
        { titulo: 'Professor', valor: (o) => o.professor },
      ], minhas)),
    ];
  }
  if (r.parcelasVencidas > 0) {
    return [h('h1', {}, `Rematrícula ${r.semestre}`),
      mensagem('erro', `Você tem ${r.parcelasVencidas} parcela(s) vencida(s). Regularize o financeiro para liberar a rematrícula.`),
      h('p', {}, h('a', { href: '#/financeiro' }, 'Ver parcelas'))];
  }
  const checks = r.ofertas.map((o) => ({ o, cb: h('input', { type: 'checkbox', checked: true, 'aria-label': o.disciplina }) }));
  const aceite = h('input', { type: 'checkbox', id: 'aceite' });
  const area = h('div');
  const btn = h('button', { type: 'submit' }, 'Confirmar rematrícula');
  const form = h('form', {}, area,
    h('div', { class: 'painel' }, h('h2', {}, '1. Escolha as disciplinas'),
      tabela([
        { titulo: '', valor: ({ cb }) => cb },
        { titulo: 'Disciplina', valor: ({ o }) => `${o.codigo} – ${o.disciplina}` },
        { titulo: 'CH', num: true, valor: ({ o }) => `${o.carga_horaria} h` },
        { titulo: 'Horário', valor: ({ o }) => `${DIAS[o.dia_semana]} ${o.hora_inicio}–${o.hora_fim}` },
        { titulo: 'Professor', valor: ({ o }) => o.professor },
      ], checks)),
    h('div', { class: 'painel' }, h('h2', {}, '2. Leia e aceite o contrato'),
      h('pre', { class: 'contrato' }, r.contrato.texto),
      h('div', { class: 'campo campo-check' }, aceite, h('label', { for: 'aceite' }, 'Li e aceito o contrato de prestação de serviços educacionais')),
      h('p', { class: 'hash' }, `Resumo SHA-256 do texto: ${r.contrato.hash}`)),
    h('div', { class: 'acoes' }, btn));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpar(area);
    if (!aceite.checked) { area.append(mensagem('erro', 'Aceite o contrato para continuar.')); return; }
    btn.disabled = true;
    try {
      await api('POST', '/rematricula', { turmas: checks.filter((c) => c.cb.checked).map((c) => c.o.id), aceiteContrato: true, hashContrato: r.contrato.hash });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { area.append(erroBox(e)); btn.disabled = false; window.scrollTo(0, 0); }
  });
  return [h('h1', {}, `Rematrícula ${r.semestre}`), form];
}

// ---------- Avaliação institucional ----------
export async function avaliacao() {
  const { perguntas, turmas } = await api('GET', '/avaliacao/pendentes');
  const area = h('div');
  const montar = (t) => {
    const escalas = perguntas.map((p, i) => h('fieldset', { class: 'escala' },
      h('legend', {}, `${i + 1}. ${p}`),
      [1, 2, 3, 4, 5].map((n) => h('label', {}, h('input', { type: 'radio', name: `p${i}`, value: n, required: true }), h('span', {}, String(n))))));
    const coment = h('textarea', { maxlength: 1000, 'aria-label': 'Comentário (opcional)' });
    const msg = h('div');
    const btn = h('button', { type: 'submit' }, 'Enviar avaliação');
    const form = h('form', {}, msg, escalas, h('div', { class: 'campo' }, h('label', {}, 'Comentário (opcional)'), coment), h('div', { class: 'acoes' }, btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpar(msg);
      const notas = perguntas.map((_, i) => Number(form.querySelector(`input[name="p${i}"]:checked`)?.value));
      btn.disabled = true;
      try {
        await api('POST', `/avaliacao/turmas/${t.turma_id}`, { notas, ...(coment.value.trim() ? { comentario: coment.value.trim() } : {}) });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) { msg.append(erroBox(e)); btn.disabled = false; }
    });
    limpar(area).append(h('div', { class: 'painel' }, h('h2', {}, `${t.disciplina} – ${t.professor}`), h('p', {}, '1 = discordo totalmente, 5 = concordo totalmente.'), form));
  };
  return [
    h('h1', {}, 'Avaliação institucional'),
    h('p', {}, 'Sua resposta é anônima: o sistema guarda que você avaliou, mas não guarda o que você respondeu ligado ao seu nome. Resultados só aparecem para turmas com pelo menos 3 respostas.'),
    h('div', { class: 'painel' }, tabela([
      { titulo: 'Disciplina', valor: (t) => t.disciplina },
      { titulo: 'Professor', valor: (t) => t.professor },
      { titulo: 'Situação', valor: (t) => (t.respondida ? selo('Respondida', 'ok') : h('button', { type: 'button', class: 'pequeno', onclick: () => montar(t) }, 'Responder')) },
    ], turmas)),
    area,
  ];
}

// ---------- Atividades complementares ----------
export async function atividades() {
  const area = h('div');
  const atualizar = () => carregar(area, async () => {
    const r = await api('GET', '/atividades/minhas');
    const pct = Math.min(100, Math.round((r.total / r.exigidas) * 100));
    return [
      h('div', { class: 'progresso-horas' },
        h('div', { class: 'media' }, `${r.total} h`), h('small', {}, `de ${r.exigidas} h exigidas (${r.aprovadas} h validadas + ${r.eventos} h em eventos)`),
        h('div', { class: 'barra' }, h('div', { 'data-p': pct }))),
      tabela([
        { titulo: 'Data', valor: (a) => fmt.data(a.data) },
        { titulo: 'Atividade', valor: (a) => a.titulo },
        { titulo: 'Categoria', valor: (a) => CATEGORIAS.find((c) => c[0] === a.categoria)?.[1] },
        { titulo: 'Horas', num: true, valor: (a) => (a.status === 'aprovada' && a.horas_aprovadas !== a.horas ? `${a.horas_aprovadas} de ${a.horas}` : a.horas) },
        { titulo: 'Situação', valor: (a) => seloDe(STATUS_ATIV, a.status) },
        { titulo: 'Parecer', valor: (a) => a.parecer || '-' },
      ], r.atividades, { vazio: 'Nenhuma atividade cadastrada.' }),
    ];
  }).then(() => area.querySelectorAll('[data-p]').forEach((el) => { el.style.width = `${el.dataset.p}%`; }));
  atualizar();
  return [
    h('h1', {}, 'Atividades complementares'),
    h('div', { class: 'grade-2' },
      h('div', { class: 'painel' }, area),
      h('div', { class: 'painel' }, h('h2', {}, 'Cadastrar atividade'), formulario({
        botao: 'Enviar para validação',
        campos: [
          { nome: 'titulo', rotulo: 'Atividade', obrigatorio: true, max: 160 },
          { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', obrigatorio: true, opcoes: CATEGORIAS.map(([valor, rotulo]) => ({ valor, rotulo })) },
          { nome: 'horas', rotulo: 'Horas', tipo: 'number', obrigatorio: true, minimo: 1, maximo: 200 },
          { nome: 'data', rotulo: 'Data de conclusão', tipo: 'date', obrigatorio: true },
          { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 2000 },
        ],
        aoEnviar: async (d, form) => { await api('POST', '/atividades', d); form.reset(); return 'Atividade enviada.'; },
        depois: atualizar,
      }))),
  ];
}

// ---------- Contrato ----------
export async function contrato() {
  const lista = await api('GET', '/rematricula/contratos');
  return [
    h('h1', {}, 'Contrato de prestação de serviços'),
    lista.length ? null : h('p', { class: 'vazio' }, 'Nenhum contrato aceito ainda. O aceite acontece na rematrícula.'),
    lista.map((c) => h('div', { class: 'painel' },
      h('div', { class: 'linha-titulo' }, h('h2', {}, `Semestre ${c.semestre}`), imprimir()),
      c.integro ? mensagem('ok', 'Integridade conferida: o texto abaixo é o mesmo que você aceitou.') : mensagem('erro', 'O texto atual difere do aceito. Procure a secretaria.'),
      h('pre', { class: 'contrato' }, c.texto),
      h('dl', { class: 'dados' },
        h('dt', {}, 'Aceito em'), h('dd', {}, fmt.dataHora(c.aceitoEm)),
        h('dt', {}, 'IP'), h('dd', {}, c.ip || '-'),
        h('dt', {}, 'SHA-256'), h('dd', { class: 'hash' }, c.hash)))),
  ];
}

// ---------- Eventos e certificados ----------
export async function eventos() {
  const lista = h('div');
  const certs = h('div');
  const atualizar = () => {
    carregar(lista, async () => {
      const evs = await api('GET', '/eventos');
      const hoje = new Date().toISOString().slice(0, 10);
      return tabela([
        { titulo: 'Data', valor: (e) => fmt.data(e.data) },
        { titulo: 'Evento', valor: (e) => h('div', {}, h('strong', {}, e.titulo), e.local ? h('div', { class: 'sub' }, e.local) : null) },
        { titulo: 'Horas', num: true, valor: (e) => e.carga_horaria },
        { titulo: 'Vagas', num: true, valor: (e) => `${e.inscritos}/${e.vagas}` },
        { titulo: '', valor: (e) => {
          if (e.inscrito) return selo('Inscrito', 'ok');
          if (e.data < hoje) return selo('Encerrado');
          return h('button', { type: 'button', class: 'pequeno', onclick: async (ev) => {
            const botao = ev.currentTarget;
            botao.disabled = true;
            try { await api('POST', `/eventos/${e.id}/inscricao`); atualizar(); } catch (err) { window.alert(err.message); botao.disabled = false; }
          } }, 'Inscrever-se');
        } },
      ], evs, { vazio: 'Nenhum evento cadastrado.' });
    });
    carregar(certs, async () => {
      const cs = await api('GET', '/eventos/meus-certificados');
      if (!cs.length) return h('p', { class: 'vazio' }, 'Os certificados aparecem aqui depois que a secretaria confirma sua presença.');
      return cs.map((c) => h('div', { class: 'certificado' },
        h('div', { class: 'certificado-marca' }, 'UNIDAVI'),
        h('p', {}, 'Certificamos que'),
        h('p', { class: 'certificado-nome' }, c.nome),
        h('p', {}, `participou do evento "${c.titulo}", realizado em ${fmt.data(c.data)}, com carga horária de ${c.carga_horaria} horas.`),
        h('p', { class: 'certificado-codigo' }, `Código de validação: ${c.codigo_certificado}`),
        h('small', {}, `Confira a autenticidade em ${window.location.origin}/api/eventos/certificados/${c.codigo_certificado}`)));
    });
  };
  atualizar();
  return [
    h('h1', {}, 'Eventos e certificados'),
    h('div', { class: 'painel' }, h('h2', {}, 'Eventos'), lista),
    h('div', { class: 'linha-titulo' }, h('h2', {}, 'Meus certificados'), imprimir()),
    certs,
  ];
}

// ---------- Documentos ----------
export async function documentos() {
  const docs = await api('GET', '/documentos/meus');
  const pendentes = docs.filter((d) => d.status === 'pendente' || d.status === 'recusado').length;
  return [
    h('h1', {}, 'Entrega de documentos'),
    pendentes ? mensagem('aviso', `${pendentes} documento(s) pendente(s). Entregue na secretaria do campus com o original e uma cópia.`) : mensagem('ok', 'Documentação completa.'),
    h('div', { class: 'painel' }, tabela([
      { titulo: 'Documento', valor: (d) => d.tipo },
      { titulo: 'Situação', valor: (d) => seloDe(STATUS_DOC, d.status) },
      { titulo: 'Observação', valor: (d) => d.observacao || '-' },
      { titulo: 'Atualizado', valor: (d) => (d.atualizado_em ? fmt.data(d.atualizado_em) : '-') },
    ], docs)),
  ];
}

// ---------- Informe de pagamentos (IR) ----------
export async function informe() {
  const area = h('div');
  const anoAtual = new Date().getFullYear();
  const sel = h('select', { 'aria-label': 'Ano-calendário' }, [anoAtual, anoAtual - 1, anoAtual - 2].map((a) => h('option', { value: a }, String(a))));
  const atualizar = () => carregar(area, async () => {
    const r = await api('GET', `/historico/informe-pagamentos?ano=${sel.value}`);
    return h('div', { class: 'painel documento' },
      h('h2', {}, `Informe de pagamentos – ano-calendário ${r.ano}`),
      h('p', {}, 'Despesas com instrução para a Declaração de Imposto de Renda Pessoa Física.'),
      h('dl', { class: 'dados' },
        h('dt', {}, 'Instituição'), h('dd', {}, r.instituicao.nome),
        h('dt', {}, 'Aluno'), h('dd', {}, `${r.beneficiario.nome} (matrícula ${r.beneficiario.matricula})`),
        h('dt', {}, 'CPF'), h('dd', {}, r.beneficiario.cpf)),
      tabela([
        { titulo: 'Parcela', num: true, valor: (p) => p.numero },
        { titulo: 'Competência', valor: (p) => p.competencia },
        { titulo: 'Pago em', valor: (p) => fmt.data(p.pago_em) },
        { titulo: 'Valor', num: true, valor: (p) => fmt.moeda(p.valor) },
      ], r.pagamentos, { vazio: 'Nenhum pagamento neste ano.' }),
      h('p', { class: 'total' }, 'Total pago no ano: ', h('strong', {}, fmt.moeda(r.total))));
  });
  sel.addEventListener('change', atualizar);
  atualizar();
  return [h('h1', {}, 'Informe de pagamentos'), h('div', { class: 'linha-form' }, sel, imprimir()), area];
}

// ---------- Histórico escolar ----------
export async function historico() {
  const r = await api('GET', '/historico/escolar');
  const situ = (s) => selo(s, { Aprovado: 'ok', Cursando: 'aviso', Reprovado: 'alerta', 'Reprovado por falta': 'alerta' }[s] || '');
  return [
    h('div', { class: 'linha-titulo' }, h('h1', {}, 'Histórico escolar'), imprimir()),
    h('div', { class: 'painel documento' },
      h('dl', { class: 'dados' },
        h('dt', {}, 'Aluno'), h('dd', {}, r.aluno.nome),
        h('dt', {}, 'Matrícula'), h('dd', {}, r.aluno.matricula),
        h('dt', {}, 'Curso'), h('dd', {}, r.aluno.curso),
        h('dt', {}, 'Coeficiente de rendimento'), h('dd', {}, h('strong', {}, r.coeficiente === null ? '-' : fmt.nota(r.coeficiente))),
        h('dt', {}, 'Carga horária com nota'), h('dd', {}, `${r.cargaHorariaCursada} h`)),
      tabela([
        { titulo: 'Semestre', valor: (d) => d.semestre },
        { titulo: 'Código', valor: (d) => d.codigo },
        { titulo: 'Disciplina', valor: (d) => d.disciplina },
        { titulo: 'CH', num: true, valor: (d) => d.carga_horaria },
        { titulo: 'Média', num: true, valor: (d) => fmt.nota(d.media) },
        { titulo: 'Frequência', num: true, valor: (d) => (d.frequencia === null ? '-' : `${d.frequencia.toLocaleString('pt-BR')}%`) },
        { titulo: 'Situação', valor: (d) => situ(d.situacao) },
      ], r.disciplinas)),
  ];
}
