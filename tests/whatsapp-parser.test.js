import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../public/js/whatsapp-parser.js', import.meta.url), 'utf-8');
const sandbox = { window: {}, console };
vm.runInNewContext(code, sandbox);
const WhatsAppParser = sandbox.window.WhatsAppParser;

test('WhatsAppParser - Extrai aposta individual com carimbo de data e hora do WhatsApp', () => {
  const raw = `[14:25, 24/09/2026] Lucas Silva: 04 12 28 35 44 59`;
  const apostas = WhatsAppParser.parse(raw);

  assert.equal(apostas.length, 1);
  assert.equal(apostas[0].nome, 'Lucas Silva');
  assert.deepEqual([...apostas[0].dezenas], ['04', '12', '28', '35', '44', '59']);
});

test('WhatsAppParser - Identifica múltiplos jogos de uma mesma pessoa na mesma linha', () => {
  const raw = `Renato Borges 01 02 03 04 05 06 10 20 30 40 50 60`;
  const apostas = WhatsAppParser.parse(raw);

  assert.equal(apostas.length, 2);
  assert.equal(apostas[0].nome, 'Renato Borges');
  assert.deepEqual([...apostas[0].dezenas], ['01', '02', '03', '04', '05', '06']);
  assert.equal(apostas[1].nome, 'Renato Borges');
  assert.deepEqual([...apostas[1].dezenas], ['10', '20', '30', '40', '50', '60']);
});

test('WhatsAppParser - Filtra e descarta números inválidos fora do intervalo 01 a 60', () => {
  const raw = `Flávia Lima 00 05 15 25 35 45 75`;
  const apostas = WhatsAppParser.parse(raw);

  // Apenas 5 números válidos restam (05, 15, 25, 35, 45), portanto não forma 6 dezenas
  assert.equal(apostas.length, 0);
  assert.ok(apostas.numerosInvalidos.includes('00') || apostas.numerosInvalidos.includes('75'));
});

test('WhatsAppParser - Ignora cabeçalhos informativos de grupos e regras', () => {
  const raw = `
REGRAS DO BOLÃO:
Valor da cota: R$ 30,00
Atenção pessoal
Carlos Eduardo: 03 07 19 33 42 58
`;
  const apostas = WhatsAppParser.parse(raw);

  assert.equal(apostas.length, 1);
  assert.equal(apostas[0].nome, 'Carlos Eduardo');
  assert.deepEqual([...apostas[0].dezenas], ['03', '07', '19', '33', '42', '58']);
});
