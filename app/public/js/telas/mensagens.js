import { api } from '../api.js';
import { h, formulario, fmt, carregar } from '../ui.js';

const DESTINOS = {
  aluno: [{ valor: 'secretaria', rotulo: 'Secretaria acadêmica' }],
  professor: [{ valor: 'turma', rotulo: 'Uma das minhas turmas' }, { valor: 'secretaria', rotulo: 'Secretaria acadêmica' }],
  secretaria: [{ valor: 'todos_alunos', rotulo: 'Todos os alunos' }, { valor: 'aluno', rotulo: 'Um aluno' }],
};

export function telaMensagens(perfil) {
  return async () => {
    const caixa = h('div');
    const enviadas = h('div');
    let extras = {};
    if (perfil === 'professor') extras.turmas = await api('GET', '/professor/turmas');
    if (perfil === 'secretaria') extras.alunos = await api('GET', '/secretaria/alunos');

    const atualizar = () => {
      carregar(caixa, async () => {
        const lista = await api('GET', '/mensagens');
        if (!lista.length) return h('p', { class: 'vazio' }, 'Nenhuma mensagem por enquanto.');
        return h('ul', { class: 'caixa' }, lista.map((m) => {
          const item = h('details', { class: `msg-item ${m.lida ? '' : 'nao-lida'}` },
            h('summary', {},
              h('span', { class: 'msg-assunto' }, m.assunto),
              h('span', { class: 'msg-de' }, m.disciplina ? `${m.remetente} · ${m.disciplina}` : m.remetente),
              h('time', { datetime: m.criado_em }, fmt.dataHora(m.criado_em))),
            h('p', { class: 'msg-corpo' }, m.corpo));
          item.addEventListener('toggle', async () => {
            if (item.open && item.classList.contains('nao-lida')) {
              item.classList.remove('nao-lida');
              try { await api('POST', `/mensagens/${m.id}/lida`); window.dispatchEvent(new Event('mentor:contadores')); } catch { /* sem efeito na leitura */ }
            }
          });
          return h('li', {}, item);
        }));
      });
      carregar(enviadas, async () => {
        const lista = await api('GET', '/mensagens/enviadas');
        if (!lista.length) return h('p', { class: 'vazio' }, 'Você ainda não enviou mensagens.');
        return h('ul', { class: 'caixa' }, lista.map((m) => h('li', {}, h('details', { class: 'msg-item' },
          h('summary', {}, h('span', { class: 'msg-assunto' }, m.assunto), h('span', { class: 'msg-de' }, `Para: ${m.para}`),
            h('time', { datetime: m.criado_em }, fmt.dataHora(m.criado_em))),
          h('p', { class: 'msg-corpo' }, m.corpo)))));
      });
    };
    atualizar();

    const campos = [{ nome: 'destino', rotulo: 'Para', tipo: 'select', obrigatorio: true, opcoes: DESTINOS[perfil], valor: DESTINOS[perfil][0].valor }];
    if (perfil === 'professor') campos.push({ nome: 'turmaId', rotulo: 'Turma', tipo: 'select', opcoes: extras.turmas.map((t) => ({ valor: t.id, rotulo: `${t.disciplina} – ${t.semestre}` })) });
    if (perfil === 'secretaria') campos.push({ nome: 'alunoId', rotulo: 'Aluno (se for para um aluno)', tipo: 'select', opcoes: extras.alunos.map((a) => ({ valor: a.id, rotulo: `${a.matricula} – ${a.nome}` })) });
    campos.push({ nome: 'assunto', rotulo: 'Assunto', obrigatorio: true, max: 120 }, { nome: 'corpo', rotulo: 'Mensagem', tipo: 'textarea', obrigatorio: true, max: 4000 });

    return [
      h('h1', {}, 'Caixa de mensagens'),
      h('div', { class: 'grade-2' },
        h('div', {},
          h('div', { class: 'painel' }, h('h2', {}, 'Recebidas'), caixa),
          h('div', { class: 'painel' }, h('h2', {}, 'Enviadas'), enviadas)),
        h('div', { class: 'painel' }, h('h2', {}, 'Nova mensagem'), formulario({
          botao: 'Enviar mensagem',
          campos,
          aoEnviar: async (d, form) => {
            await api('POST', '/mensagens', d);
            form.reset();
            return 'Mensagem enviada.';
          },
          depois: atualizar,
        }))),
    ];
  };
}

