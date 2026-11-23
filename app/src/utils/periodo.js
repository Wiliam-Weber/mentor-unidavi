'use strict';

// Calendário acadêmico (em um sistema real viria de uma tabela de configuração)
module.exports = Object.freeze({
  SEMESTRE_ATUAL: '2026/2',
  SEMESTRE_REMATRICULA: '2027/1',
  HORAS_COMPLEMENTARES_EXIGIDAS: 200,
  DOCUMENTOS_OBRIGATORIOS: [
    'RG', 'CPF', 'Certidão de nascimento ou casamento', 'Histórico do ensino médio',
    'Certificado de conclusão do ensino médio', 'Comprovante de residência', 'Título de eleitor', 'Foto 3x4',
  ],
  PROGRAMAS_BOLSA: {
    uniedu_170: 'UNIEDU – Art. 170 (bolsa de estudo)',
    uniedu_171: 'UNIEDU – Art. 171 (FUMDES)',
    desconto_unidavi: 'Desconto institucional UNIDAVI',
    convenio_empresa: 'Convênio com empresa',
  },
  PERGUNTAS_AVALIACAO: [
    'O professor apresentou o plano de ensino e cumpriu o que foi proposto.',
    'As aulas foram claras e bem organizadas.',
    'O professor esteve disponível para tirar dúvidas.',
    'As avaliações foram coerentes com o conteúdo trabalhado.',
    'O material de apoio contribuiu para o aprendizado.',
    'A estrutura (sala, laboratório, equipamentos) atendeu à disciplina.',
  ],
});
