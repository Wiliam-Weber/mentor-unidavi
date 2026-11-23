'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const CUSTO_BCRYPT = 12;

const politicaSenha = z.string()
  .min(10, 'A senha deve ter no mínimo 10 caracteres')
  .max(128, 'A senha deve ter no máximo 128 caracteres')
  .regex(/[a-z]/, 'A senha deve ter ao menos uma letra minúscula')
  .regex(/[A-Z]/, 'A senha deve ter ao menos uma letra maiúscula')
  .regex(/\d/, 'A senha deve ter ao menos um número')
  .regex(/[^A-Za-z0-9]/, 'A senha deve ter ao menos um caractere especial');

const gerarHash = (senha) => bcrypt.hash(senha, CUSTO_BCRYPT);
const verificar = (senha, hash) => bcrypt.compare(senha, hash);

// Hash fictício para igualar o tempo de resposta quando o e-mail não existe
let hashFicticio;
function obterHashFicticio() {
  if (!hashFicticio) hashFicticio = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), CUSTO_BCRYPT);
  return hashFicticio;
}

function gerarSenhaTemporaria() {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
  const todos = grupos.join('');
  const chars = grupos.map((g) => g[crypto.randomInt(g.length)]);
  while (chars.length < 14) chars.push(todos[crypto.randomInt(todos.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { politicaSenha, gerarHash, verificar, obterHashFicticio, gerarSenhaTemporaria };
