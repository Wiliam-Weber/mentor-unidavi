'use strict';
const { z } = require('zod');

function cpfValido(valor) {
  const cpf = String(valor).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10]);
}

// LGPD: CPF nunca é exibido completo
function mascararCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const texto = (min, max) => z.string().trim().min(min).max(max);
const telefone = z.string().trim().regex(/^[0-9()+\-\s]{8,20}$/, 'Telefone inválido');

module.exports = { cpfValido, mascararCpf, escaparLike, texto, telefone };
