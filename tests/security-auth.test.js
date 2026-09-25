import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword, generateToken, verifyToken } from '../api/_auth.js';
import { validateBolaoPayload } from '../api/_validation.js';

test('Segurança - Autenticação por Token HMAC', () => {
  // 1. Senha correta gera token
  assert.equal(checkPassword('sena2026!'), true);
  assert.equal(checkPassword('senha_errada'), false);
  assert.equal(checkPassword(''), false);

  // 2. Token gerado é válido
  const token = generateToken();
  assert.ok(token && typeof token === 'string');
  assert.equal(verifyToken(token), true);
  assert.equal(verifyToken(`Bearer ${token}`), true);

  // 3. Token forjado ou adulterado é rejeitado
  const parts = token.split('.');
  const forged = `${parts[0]}.assinatura_falsa`;
  assert.equal(verifyToken(forged), false);
  assert.equal(verifyToken('token_totalmente_invalido'), false);
});

test('Segurança & Integridade - Validação de Schema no Backend', () => {
  // Payload válido
  const valido = {
    nomeBolao: 'Bolão Oficial',
    ciclos: [
      {
        id: 1,
        nome: 'Edição 1',
        valorCota: 30,
        apostas: [
          { nome: 'Lucas', dezenas: ['01', '02', '03', '04', '05', '06'] }
        ]
      }
    ]
  };
  assert.equal(validateBolaoPayload(valido).valid, true);

  // Payload inválido: dezena fora do intervalo (ex: 75)
  const dezenaInvalida = {
    nomeBolao: 'Bolão Oficial',
    ciclos: [
      {
        id: 1,
        nome: 'Edição 1',
        apostas: [
          { nome: 'Lucas', dezenas: ['01', '02', '03', '04', '05', '75'] }
        ]
      }
    ]
  };
  assert.equal(validateBolaoPayload(dezenaInvalida).valid, false);

  // Payload inválido: dezenas duplicadas no mesmo jogo (ex: dois '10')
  const dezenaDuplicada = {
    nomeBolao: 'Bolão Oficial',
    ciclos: [
      {
        id: 1,
        nome: 'Edição 1',
        apostas: [
          { nome: 'Lucas', dezenas: ['10', '10', '03', '04', '05', '06'] }
        ]
      }
    ]
  };
  assert.equal(validateBolaoPayload(dezenaDuplicada).valid, false);
});
