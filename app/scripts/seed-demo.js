'use strict';
// Popula dados de DEMONSTRAÇÃO (apresentação do trabalho). Bloqueado em produção.
// Uso: defina SEED_PASSWORD no .env e rode: npm run seed:demo
const crypto = require('crypto');
const { conectar } = require('./_conexao');
const { politicaSenha, gerarHash } = require('../src/utils/senha');
const { gerarCodigo } = require('../src/utils/codigos');

if (process.env.NODE_ENV === 'production') {
  console.error('Seed de demonstração não pode rodar em produção.');
  process.exit(1);
}
const senha = process.env.SEED_PASSWORD;
const valida = politicaSenha.safeParse(senha || '');
if (!valida.success) {
  console.error('Defina SEED_PASSWORD respeitando a política de senha:\n' + valida.error.issues.map((i) => `- ${i.message}`).join('\n'));
  process.exit(1);
}

const ALUNOS = [
  ['Wiliam Mateus Weber', 'aluno@demo.unidavi.edu.br', '2026001', '52998224725'],
  ['Ana Carolina Schmitt', 'ana@demo.unidavi.edu.br', '2026002', '11144477735'],
  ['Bruno Henrique Kock', 'bruno@demo.unidavi.edu.br', '2026003', '39053344705'],
  ['Larissa Vieira Bauer', 'larissa@demo.unidavi.edu.br', '2026004', '86288366757'],
  ['Gustavo Pereira Zimmermann', 'gustavo@demo.unidavi.edu.br', '2026005', '71428793860'],
  ['Júlia Fernanda Hoffmann', 'julia@demo.unidavi.edu.br', '2026006', '26346278018'],
];
const ATUAIS = ['SI-AUD', 'SI-CLD', 'SI-IOT', 'SI-GC'];
const PROXIMAS = ['SI-TCC2', 'SI-GTI', 'SI-EMP', 'SI-MOB'];
const HORARIOS = [[1, '19:00', '22:30', 'Lab 3'], [2, '19:00', '22:30', 'Sala 210'], [3, '19:00', '20:40', 'Lab 1'], [4, '20:50', '22:30', 'Sala 105']];

(async () => {
  const c = conectar();
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(727002)'); // duas instâncias não semeiam ao mesmo tempo
    const hash = await gerarHash(senha);
    const usuario = async (nome, email, perfil) => (await c.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, troca_senha_obrigatoria) VALUES ($1, $2, $3, $4, false)
       ON CONFLICT ((lower(email))) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
      [nome, email, hash, perfil],
    )).rows[0].id;

    const sec = await usuario('Secretaria Acadêmica', 'secretaria@demo.unidavi.edu.br', 'secretaria');
    const prof = await usuario('Fabiano', 'professor@demo.unidavi.edu.br', 'professor');
    const prof2 = await usuario('Marina Krause Silva', 'marina@demo.unidavi.edu.br', 'professor');

    const alunos = [];
    for (const [nome, email, matricula, cpf] of ALUNOS) {
      const id = await usuario(nome, email, 'aluno');
      await c.query(
        `INSERT INTO alunos (usuario_id, matricula, cpf, curso, data_nascimento, telefone, endereco)
         VALUES ($1, $2, $3, 'Sistemas de Informação', '2002-05-14', '(47) 99999-0000', 'Rua Guilherme Gemballa, Rio do Sul - SC')
         ON CONFLICT (usuario_id) DO NOTHING`,
        [id, matricula, cpf],
      );
      alunos.push(id);
    }

    const turma = async (codigo, semestre, professor, h) => {
      const d = (await c.query('SELECT id FROM disciplinas WHERE codigo = $1', [codigo])).rows[0].id;
      const existe = await c.query('SELECT id FROM turmas WHERE disciplina_id = $1 AND semestre = $2', [d, semestre]);
      if (existe.rows[0]) return existe.rows[0].id;
      return (await c.query(
        `INSERT INTO turmas (disciplina_id, professor_id, semestre, dia_semana, hora_inicio, hora_fim, sala)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [d, professor, semestre, ...h],
      )).rows[0].id;
    };

    // Semestre atual: turmas, aulas, presenças e notas
    const turmasAtuais = [];
    for (const [i, codigo] of ATUAIS.entries()) {
      const t = await turma(codigo, '2026/2', prof, HORARIOS[i]);
      turmasAtuais.push(t);
      for (const a of alunos) await c.query('INSERT INTO turma_alunos (turma_id, aluno_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [t, a]);
      for (const [k, data] of ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-14'].entries()) {
        const aula = await c.query(
          `INSERT INTO aulas (turma_id, data, conteudo) VALUES ($1, $2, $3)
           ON CONFLICT (turma_id, data) DO UPDATE SET conteudo = EXCLUDED.conteudo RETURNING id`,
          [t, data, `Aula ${k + 1}`],
        );
        for (const [j, a] of alunos.entries()) {
          await c.query('INSERT INTO presencas (aula_id, aluno_id, presente) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [aula.rows[0].id, a, (j * 2 + k) % 7 !== 3]);
        }
      }
      for (const [j, a] of alunos.entries()) {
        await c.query(
          `INSERT INTO notas (turma_id, aluno_id, avaliacao, peso, nota, lancado_por) VALUES ($1, $2, 'Prova 1', 4, $3, $4), ($1, $2, 'Trabalho', 3, $5, $4)
           ON CONFLICT DO NOTHING`,
          [t, a, 6 + ((i + j) % 4) + 0.5, prof, 7 + ((i * 2 + j) % 3)],
        );
      }
    }

    // Semestre anterior já concluído (aparece no histórico escolar)
    await c.query(
      `INSERT INTO disciplinas (codigo, nome, carga_horaria) VALUES
         ('SI-BD2', 'Banco de Dados II', 72), ('SI-ES', 'Engenharia de Software', 72), ('SI-RC', 'Redes de Computadores', 72)
       ON CONFLICT (codigo) DO NOTHING`,
    );
    for (const [i, codigo] of ['SI-BD2', 'SI-ES', 'SI-RC'].entries()) {
      const t = await turma(codigo, '2026/1', i === 1 ? prof2 : prof, HORARIOS[i]);
      for (const [j, a] of alunos.entries()) {
        await c.query('INSERT INTO turma_alunos (turma_id, aluno_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [t, a]);
        await c.query(
          `INSERT INTO notas (turma_id, aluno_id, avaliacao, peso, nota, lancado_por) VALUES ($1, $2, 'Média final', 1, $3, $4) ON CONFLICT DO NOTHING`,
          [t, a, [8.4, 7.6, 9.1][i] - (j % 3) * 0.7, prof],
        );
      }
      const aula = await c.query(
        `INSERT INTO aulas (turma_id, data, conteudo) VALUES ($1, '2026-06-15', 'Encerramento')
         ON CONFLICT (turma_id, data) DO UPDATE SET conteudo = EXCLUDED.conteudo RETURNING id`, [t],
      );
      for (const a of alunos) await c.query('INSERT INTO presencas (aula_id, aluno_id, presente) VALUES ($1, $2, true) ON CONFLICT DO NOTHING', [aula.rows[0].id, a]);
    }

    // Próximo semestre: oferta para a rematrícula
    for (const [i, codigo] of PROXIMAS.entries()) await turma(codigo, '2027/1', i % 2 ? prof : prof2, HORARIOS[i]);

    // Financeiro: o primeiro aluno está em dia; a Ana tem uma parcela vencida (mostra o bloqueio da rematrícula)
    for (const [j, a] of alunos.entries()) {
      const tem = await c.query('SELECT 1 FROM parcelas WHERE aluno_id = $1', [a]);
      if (tem.rowCount) continue;
      await c.query(
        `INSERT INTO parcelas (aluno_id, numero, competencia, vencimento, valor, status, pago_em)
         SELECT $1, g, to_char(v, 'MM/YYYY'), v, 1180.00,
                CASE WHEN v < current_date AND NOT ($2 AND g = 3) THEN 'paga'::status_parcela ELSE 'aberta'::status_parcela END,
                CASE WHEN v < current_date AND NOT ($2 AND g = 3) THEN v - 2 END
           FROM generate_series(1, 6) g, LATERAL (SELECT (date '2026-07-10' + (g - 1) * interval '1 month')::date AS v) x`,
        [a, j === 1],
      );
    }

    // Documentos: alguns já entregues
    const docs = ['RG', 'CPF', 'Histórico do ensino médio', 'Foto 3x4'];
    for (const a of alunos) {
      for (const [k, tipo] of docs.entries()) {
        await c.query(
          'INSERT INTO documentos_aluno (aluno_id, tipo, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [a, tipo, k < 3 ? 'aprovado' : 'entregue'],
        );
      }
    }

    const vazio = async (tabela) => !(await c.query(`SELECT 1 FROM ${tabela} LIMIT 1`)).rowCount;

    if (await vazio('mensagens')) {
      await c.query(
        `INSERT INTO mensagens (remetente_id, para_todos_alunos, assunto, corpo) VALUES
          ($1, true, 'Rematrícula 2027/1 aberta', 'A rematrícula para o semestre 2027/1 está disponível no Mentor até 15/12. Confira se não há parcelas vencidas antes de confirmar.'),
          ($1, true, 'Semana Acadêmica de Sistemas', 'Inscrições abertas para a Semana Acadêmica. As horas contam como atividade complementar.')`,
        [sec],
      );
      await c.query(
        `INSERT INTO mensagens (remetente_id, turma_id, assunto, corpo)
         VALUES ($1, $2, 'Entrega do trabalho de segurança', 'Lembrete: o repositório com pipeline, Terraform e scanner deve ser entregue até a próxima aula.')`,
        [prof, turmasAtuais[0]],
      );
    }

    if (await vazio('materiais')) {
      await c.query(
        `INSERT INTO materiais (turma_id, professor_id, titulo, descricao, url) VALUES
          ($1, $3, 'OWASP Top 10', 'Leitura obrigatória antes da prova.', 'https://owasp.org/www-project-top-ten/'),
          ($1, $3, 'Slides – Auditoria de sistemas', 'Material da aula 4.', null),
          ($2, $3, 'Documentação do Terraform AWS', 'Provider oficial usado no trabalho.', 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs')`,
        [turmasAtuais[0], turmasAtuais[1], prof],
      );
    }

    if (await vazio('eventos')) {
      const passado = (await c.query(
        `INSERT INTO eventos (titulo, descricao, local, data, carga_horaria, vagas, criado_por)
         VALUES ('Palestra: Segurança em nuvem na prática', 'Casos reais de incidentes em AWS e como evitá-los.', 'Auditório central', '2026-09-22', 4, 200, $1) RETURNING id`,
        [sec],
      )).rows[0].id;
      await c.query(
        `INSERT INTO eventos (titulo, descricao, local, data, carga_horaria, vagas, criado_por) VALUES
          ('Semana Acadêmica de Sistemas de Informação', 'Palestras, minicursos e maratona de programação.', 'Bloco D', '2026-12-07', 20, 150, $1),
          ('Hackathon UNIDAVI 2026', 'Desafio de 24 horas com empresas da região.', 'Laboratórios do bloco D', '2026-12-12', 24, 60, $1)`,
        [sec],
      );
      for (const a of alunos.slice(0, 4)) {
        await c.query(
          'INSERT INTO eventos_inscricoes (evento_id, aluno_id, presente, codigo_certificado) VALUES ($1, $2, true, $3)',
          [passado, a, gerarCodigo()],
        );
      }
    }

    if (await vazio('atividades_complementares')) {
      await c.query(
        `INSERT INTO atividades_complementares (aluno_id, titulo, categoria, horas, data, status, horas_aprovadas, parecer) VALUES
          ($1, 'Curso AWS Cloud Practitioner Essentials', 'ensino', 6, '2026-04-10', 'aprovada', 6, 'Certificado conferido.'),
          ($1, 'Estágio em desenvolvimento web', 'profissional', 60, '2026-06-30', 'aprovada', 40, 'Limite de 40 h por estágio.'),
          ($1, 'Voluntariado no Dia do Software Livre', 'extensao', 8, '2026-09-19', 'enviada', null, null)`,
        [alunos[0]],
      );
    }

    // Ranking do basquete já disputado (partidas fictícias dos colegas)
    if (await vazio('basquete_partidas')) {
      const placares = [[1, 38, 13, 20, 4], [2, 31, 11, 19, 3], [3, 27, 10, 18, 3], [4, 22, 8, 17, 2], [5, 16, 6, 15, 2], [1, 29, 10, 18, 3]];
      for (const [j, pontos, cestas, arremessos, seq] of placares) {
        await c.query(
          `INSERT INTO basquete_partidas (aluno_id, semente, iniciada_em, finalizada_em, pontos, cestas, arremessos, swishes, melhor_sequencia)
           VALUES ($1, $2, now() - interval '2 days', now() - interval '2 days' + interval '70 seconds', $3, $4, $5, 1, $6)`,
          [alunos[j], crypto.randomInt(1, 2 ** 31 - 1), pontos, cestas, arremessos, seq],
        );
      }
    }

    await c.query('COMMIT');
    console.log('Dados de demonstração criados. Senha de todos = SEED_PASSWORD');
    console.log('  secretaria@demo.unidavi.edu.br · professor@demo.unidavi.edu.br · aluno@demo.unidavi.edu.br');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Falha no seed:', err.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
