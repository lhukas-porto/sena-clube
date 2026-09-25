import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../public/js/mask-utils.js', import.meta.url), 'utf-8');
const sandbox = { window: {}, console };
vm.runInNewContext(code, sandbox);
const MaskUtils = sandbox.MaskUtils || sandbox.window.MaskUtils;

test('MaskUtils - Formatação de Telefone (Celular e Fixo)', () => {
  // Celular (11 dígitos)
  assert.equal(MaskUtils.formatarTelefone('61996272630'), '(61) 99627-2630');
  assert.equal(MaskUtils.formatarTelefone('(61) 99627-2630'), '(61) 99627-2630');
  assert.equal(MaskUtils.formatarTelefone('11987654321'), '(11) 98765-4321');

  // Fixo (10 dígitos)
  assert.equal(MaskUtils.formatarTelefone('6133211234'), '(61) 3321-1234');

  // Digitação progressiva
  assert.equal(MaskUtils.formatarTelefone('61'), '(61');
  assert.equal(MaskUtils.formatarTelefone('619'), '(61) 9');
  assert.equal(MaskUtils.formatarTelefone('619962'), '(61) 9962');
  assert.equal(MaskUtils.formatarTelefone('61996272'), '(61) 9962-72');
});

test('MaskUtils - Formatação de CPF (11 dígitos)', () => {
  // CPF do usuário
  assert.equal(MaskUtils.formatarCPF('82885192100'), '828.851.921-00');
  assert.equal(MaskUtils.formatarCPF('828.851.921-00'), '828.851.921-00');
  assert.equal(MaskUtils.formatarCPF('12345678909'), '123.456.789-09');

  // Digitação progressiva
  assert.equal(MaskUtils.formatarCPF('828'), '828');
  assert.equal(MaskUtils.formatarCPF('828851'), '828.851');
  assert.equal(MaskUtils.formatarCPF('828851921'), '828.851.921');
  assert.equal(MaskUtils.formatarCPF('82885192100'), '828.851.921-00');
});

test('MaskUtils - Formatação de CNPJ (14 dígitos)', () => {
  assert.equal(MaskUtils.formatarCNPJ('12345678000195'), '12.345.678/0001-95');
  assert.equal(MaskUtils.formatarCNPJ('12.345.678/0001-95'), '12.345.678/0001-95');
});

test('MaskUtils - Chave PIX Inteligente (Detecção e Formatação)', () => {
  // Caso real do usuário: CPF onde 3º dígito não é 9
  assert.equal(MaskUtils.formatarChavePix('82885192100'), '828.851.921-00');
  assert.equal(MaskUtils.identificarTipoPix('82885192100'), 'cpf');

  // Celular com DDD
  assert.equal(MaskUtils.formatarChavePix('61996272630'), '(61) 99627-2630');
  assert.equal(MaskUtils.formatarChavePix('(61) 99627-2630'), '(61) 99627-2630');
  assert.equal(MaskUtils.identificarTipoPix('(61) 99627-2630'), 'celular');

  // E-mail
  assert.equal(MaskUtils.formatarChavePix('contato@senaclube.com.br'), 'contato@senaclube.com.br');
  assert.equal(MaskUtils.identificarTipoPix('contato@senaclube.com.br'), 'email');

  // CNPJ
  assert.equal(MaskUtils.formatarChavePix('12345678000195'), '12.345.678/0001-95');
  assert.equal(MaskUtils.identificarTipoPix('12345678000195'), 'cnpj');

  // Chave Aleatória (UUID)
  const uuid = 'e9b867c2-1c25-4c07-b248-18544e397825';
  assert.equal(MaskUtils.formatarChavePix(uuid), uuid);
  assert.equal(MaskUtils.identificarTipoPix(uuid), 'aleatoria');
});

test('MaskUtils - Telefone ou Texto (Observação do Apostador)', () => {
  assert.equal(MaskUtils.formatarTelefoneOuTexto('Pago via Pix'), 'Pago via Pix');
  assert.equal(MaskUtils.formatarTelefoneOuTexto('Amigo do Pedro'), 'Amigo do Pedro');
  assert.equal(MaskUtils.formatarTelefoneOuTexto('61996272630'), '(61) 99627-2630');
  assert.equal(MaskUtils.formatarTelefoneOuTexto('82885192100'), '828.851.921-00');
});
