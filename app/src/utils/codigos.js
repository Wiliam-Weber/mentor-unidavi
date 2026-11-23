'use strict';
const crypto = require('crypto');

// Código de certificado: 12 caracteres aleatórios (crypto), sem caracteres ambíguos (0/O, 1/I)
function gerarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos: b % 32 não gera viés
  const c = Array.from(crypto.randomBytes(12), (b) => alfabeto[b % alfabeto.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

module.exports = { gerarCodigo };
