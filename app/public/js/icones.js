// Ícones de traço (24x24) desenhados à mão, criados via DOM (compatível com a CSP, sem innerHTML)
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  inicio: ['M3 11l9-7 9 7', 'M5 10v10h5v-6h4v6h5V10'],
  horarios: ['M4 5h16v15H4z', 'M4 9h16', 'M8 3v4', 'M16 3v4', 'M8 13h3', 'M13 13h3', 'M8 16h3'],
  notas: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h7', 'M9 16h4'],
  frequencia: ['M4 6l2 2 3-3', 'M12 7h8', 'M4 12l2 2 3-3', 'M12 13h8', 'M5 18h3', 'M12 19h8'],
  jogo: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4', 'M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M8 20h8', 'M10 17h4v3h-4z'],
  requerimentos: ['M5 4h14v16H5z', 'M9 4v3h6V4', 'M8 11h8', 'M8 15h5'],
  financeiro: ['M3 7h18v12H3z', 'M3 11h18', 'M7 15h4', 'M16 5H6'],
  planos: ['M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z', 'M12 6v14'],
  dados: ['M3 5h18v14H3z', 'M8 10a2 2 0 1 0 0.01 0', 'M5.5 16c.5-2 4.5-2 5 0', 'M13 10h5', 'M13 14h4'],
  senha: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3', 'M12 15v2'],
  turmas: ['M9 8a3 3 0 1 0 .01 0', 'M3 20c0-3.5 3-5 6-5s6 1.5 6 5', 'M16 6a2.5 2.5 0 1 1 0 5', 'M17 14c2.5.3 4 1.8 4 4.5'],
  presencas: ['M4 4h16v16H4z', 'M8 12l3 3 5-6'],
  alunos: ['M3 9l9-5 9 5-9 5z', 'M7 11.5V16c3 2 7 2 10 0v-4.5', 'M21 9v5'],
  tipos: ['M4 4h7l9 9-7 7-9-9z', 'M8 8.01V8'],
  bolsa: ['M12 3l9 4.5-9 4.5-9-4.5z', 'M6 9.5V15c3.5 2.5 8.5 2.5 12 0V9.5', 'M9 18.5l6-6', 'M9.5 13.5h.01', 'M14.5 18h.01'],
  mensagens: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  material: ['M3 6h6l2 2h10v11H3z', 'M3 10h18'],
  rematricula: ['M4 12a8 8 0 0 1 14-5.3', 'M18 3v4h-4', 'M20 12a8 8 0 0 1-14 5.3', 'M6 21v-4h4'],
  avaliacao: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  atividades: ['M12 4a8 8 0 1 0 .01 0', 'M12 8v4l3 2'],
  contrato: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 11h7', 'M9 14h5', 'M9 18c1-1.5 2-1.5 3 0s2 1.5 3 0'],
  certificado: ['M12 3a5 5 0 1 0 .01 0', 'M8.5 12l-1.5 9 5-3 5 3-1.5-9'],
  documentos: ['M4 5h7l2 2h7v12H4z', 'M9 13l2 2 4-4'],
  informe: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  historico: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M9 8h6', 'M9 12h6', 'M5 17a3 3 0 0 1 3-3h11'],
  basquete: ['M12 3a9 9 0 1 0 .01 0', 'M3 12h18', 'M12 3v18', 'M5.6 5.6c3 3 3 9.8 0 12.8', 'M18.4 5.6c-3 3-3 9.8 0 12.8'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  externo: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
};

export function icone(nome, tamanho = 30) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', tamanho);
  svg.setAttribute('height', tamanho);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[nome] || PATHS.inicio) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
