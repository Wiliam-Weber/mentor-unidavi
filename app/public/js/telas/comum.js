import { api } from '../api.js';
import { h, formulario } from '../ui.js';

export function telaSenha(obrigatoria = false, aoConcluir) {
  return [
    h('h1', {}, 'Alterar senha'),
    obrigatoria ? h('div', { class: 'msg msg-aviso' }, 'Por segurança, defina uma nova senha antes de usar o sistema.') : null,
    h('div', { class: 'painel' },
      h('p', {}, 'A senha precisa ter no mínimo 10 caracteres, com letra maiúscula, minúscula, número e caractere especial. Ao trocar, as outras sessões abertas são encerradas.'),
      formulario({
        botao: 'Alterar senha',
        campos: [
          { nome: 'senhaAtual', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 128 },
          { nome: 'novaSenha', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', max: 128 },
          { nome: 'confirmacao', rotulo: 'Confirme a nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', max: 128 },
        ],
        aoEnviar: async (d, form) => {
          if (d.novaSenha !== d.confirmacao) throw new Error('A confirmação não confere com a nova senha');
          const r = await api('POST', '/auth/alterar-senha', { senhaAtual: d.senhaAtual, novaSenha: d.novaSenha });
          form.reset();
          if (aoConcluir) aoConcluir(r.usuario);
          return 'Senha alterada.';
        },
      })),
  ];
}
