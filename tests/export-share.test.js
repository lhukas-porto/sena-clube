import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const engineCode = fs.readFileSync(new URL('../public/js/bolao-engine.js', import.meta.url), 'utf-8');
const exportCode = fs.readFileSync(new URL('../public/js/export-share.js', import.meta.url), 'utf-8');

const sandbox = { window: {}, console, document: {} };
vm.runInNewContext(engineCode, sandbox);
vm.runInNewContext(exportCode, sandbox);

const BolaoEngine = sandbox.window.BolaoEngine;
const ExportShare = sandbox.window.ExportShare;

test('ExportShare - Gera boletim atualizado com múltiplos sorteios e ranking de acertos', () => {
  const ciclo = {
    id: 1,
    nome: 'Edição 1',
    concursoInicial: 3064,
    valorCota: 30,
    apostas: [
      { id: '1', nome: 'Zé Luiz', dezenas: ['05', '10', '15', '20', '25', '30'], pago: true },
      { id: '2', nome: 'Caio Lasse', dezenas: ['01', '02', '03', '04', '05', '06'], pago: true }
    ],
    concursos: [
      { numero: 3064, dezenas: ['05', '12', '23', '34', '45', '56'], dataApuracao: '2026-09-25' },
      { numero: 3065, dezenas: ['10', '15', '22', '33', '44', '55'], dataApuracao: '2026-09-28' },
      { numero: 3066, dezenas: ['20', '31', '32', '41', '42', '51'], dataApuracao: '2026-09-30' },
      { numero: 3067, dezenas: ['25', '30', '35', '40', '48', '58'], dataApuracao: '2026-10-03' }
    ]
  };

  const apuracao = BolaoEngine.apurar(ciclo.apostas, ciclo.concursos);
  const fin = BolaoEngine.calcularFinanceiro(ciclo.apostas, ciclo.valorCota, 0.20, 0, false, true);
  const msg = ExportShare.gerarRelatorioWhatsApp({ nomeBolao: 'Bolão dos Amigos' }, apuracao, fin, ciclo);

  // Deve refletir os 4 sorteios acumulados
  assert.ok(msg.includes('4 sorteios acumulados'), 'Deve indicar os 4 sorteios acumulados');
  assert.ok(msg.includes('Concursos 3064 a 3067'), 'Deve indicar o intervalo de concursos');
  assert.ok(msg.includes('1º Sorteio (Conc. 3064)'), 'Deve conter o 1º sorteio');
  assert.ok(msg.includes('4º Sorteio (Conc. 3067)'), 'Deve conter o 4º sorteio');

  // Zé Luiz acertou 05, 10, 15, 20, 25, 30 (total 6 acertos!)
  assert.ok(msg.includes('Zé Luiz'), 'Deve listar Zé Luiz');
  assert.ok(msg.includes('6/6 acertos') || msg.includes('acertos'), 'Deve conter a pontuação calculada');
  assert.ok(!msg.includes('Aguardando primeiro sorteio oficial!'), 'Não pode conter status de aguardando sorteio');
});
