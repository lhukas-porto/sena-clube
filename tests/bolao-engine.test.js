import test from 'node:test';
import assert from 'node:assert/strict';
import BolaoEngine from '../public/js/bolao-engine.js';

test('BolaoEngine - Cálculo Financeiro padrão com taxa de 20% e Quadra dinâmica', () => {
  const apostas = [
    { id: '1', nome: 'Lucas', dezenas: ['01', '02', '03', '04', '05', '06'], pago: true },
    { id: '2', nome: 'Edgard', dezenas: ['10', '20', '30', '40', '50', '60'], pago: true },
    { id: '3', nome: 'Flávia', dezenas: ['11', '22', '33', '44', '55', '56'], pago: true },
    { id: '4', nome: 'Carlos', dezenas: ['07', '08', '09', '14', '15', '16'], pago: false }
  ];

  // 3 pagas, 1 pendente, cota 30.00, taxa 20%
  const fin = BolaoEngine.calcularFinanceiro(apostas, 30.0, 0.20, 0, false, true);

  assert.equal(fin.totalApostas, 4);
  assert.equal(fin.pagas, 3);
  assert.equal(fin.pendentes, 1);
  assert.equal(fin.totalArrecadadoBruto, 90.0);
  assert.equal(fin.valorOrganizadorArrecadado, 18.0);
  assert.equal(fin.totalLiquidoGeralArrecadado, 72.0);
  // Quadra dinâmica: 10% de 72.00 = 7.20
  assert.equal(fin.premioQuadraConfig, 7.20);
  // Sem ganhador da quadra: sena leva o total líquido arrecadado
  assert.equal(fin.premioSenaLiquido, 72.0);
});

test('BolaoEngine - Dedução da Quadra quando houver ganhador no 1º sorteio', () => {
  const apostas = [
    { id: '1', nome: 'Lucas', dezenas: ['01', '02', '03', '04', '05', '06'], pago: true },
    { id: '2', nome: 'Edgard', dezenas: ['10', '20', '30', '40', '50', '60'], pago: true }
  ];

  // 2 pagas = R$ 60 bruto -> R$ 48 líquido -> Quadra 10% = R$ 4.80
  const fin = BolaoEngine.calcularFinanceiro(apostas, 30.0, 0.20, 0, true, true);

  assert.equal(fin.quadraPremiada, true);
  assert.equal(fin.valorPagoQuadra, 4.80);
  // Sena líquida = 48.00 - 4.80 = 43.20
  assert.equal(fin.premioSenaLiquido, 43.20);
});

test('BolaoEngine - Apuração de Acertos e Detecção de Campeão da Sena', () => {
  const apostas = [
    { id: '1', nome: 'Campeão', dezenas: ['05', '10', '15', '20', '25', '30'] },
    { id: '2', nome: 'Quase', dezenas: ['05', '10', '15', '20', '55', '56'] }
  ];

  const concursos = [
    { numero: 3060, dezenas: ['05', '10', '15', '41', '42', '43'], dataApuracao: '2026-09-20' },
    { numero: 3061, dezenas: ['20', '25', '30', '50', '51', '52'], dataApuracao: '2026-09-23' }
  ];

  const res = BolaoEngine.apurar(apostas, concursos);

  assert.equal(res.temVencedorSena, true);
  assert.equal(res.ganhadoresSena.length, 1);
  assert.equal(res.ganhadoresSena[0].nome, 'Campeão');
  assert.equal(res.ganhadoresSena[0].totalAcertos, 6);
});

test('BolaoEngine - Comparação entre Edições (Mantidas, Alteradas, Novas)', () => {
  const base = [
    { id: 'a1', nome: 'Lucas', dezenas: ['01', '02', '03', '04', '05', '06'] },
    { id: 'a2', nome: 'Renato', dezenas: ['10', '20', '30', '40', '50', '60'] }
  ];

  const novas = [
    { nome: 'Lucas', dezenas: ['01', '02', '03', '04', '05', '06'] }, // Mantida
    { nome: 'Renato', dezenas: ['11', '21', '31', '41', '51', '60'] }, // Alterada
    { nome: 'Flávia', dezenas: ['07', '08', '09', '14', '15', '16'] }  // Nova
  ];

  const comp = BolaoEngine.compararComCicloAnterior(base, novas);

  assert.equal(comp.totalMantidas, 1);
  assert.equal(comp.totalAlteradas, 1);
  assert.equal(comp.totalNovas, 1);
  assert.equal(comp.totalNaoRenovadas, 0);
});
