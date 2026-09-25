/**
 * SenaClube — Módulo Utilitário de Máscaras (v1.0)
 * Formatação e máscaras em tempo real para Celular/WhatsApp, CPF, CNPJ e Chave PIX
 */

const MaskUtils = {
  /**
   * Formata número de telefone brasileiro (Fixo: 10 dígitos, Celular: 11 dígitos)
   * Ex: (61) 99627-2630 ou (61) 3321-1234
   */
  formatarTelefone(val) {
    if (!val) return '';
    const digits = String(val).replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';

    if (digits.length <= 2) {
      return `(${digits}`;
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  },

  /**
   * Formata Cadastro de Pessoa Física (CPF - 11 dígitos)
   * Ex: 000.000.000-00
   */
  formatarCPF(val) {
    if (!val) return '';
    const digits = String(val).replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  },

  /**
   * Formata Cadastro Nacional da Pessoa Jurídica (CNPJ - 14 dígitos)
   * Ex: 00.000.000/0000-00
   */
  formatarCNPJ(val) {
    if (!val) return '';
    const digits = String(val).replace(/\D/g, '').slice(0, 14);
    if (!digits) return '';

    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  },

  /**
   * Detecta o tipo de Chave PIX (cpf, celular, email, cnpj, aleatoria ou vazio)
   */
  identificarTipoPix(val) {
    if (!val) return 'vazio';
    const str = String(val).trim();
    if (!str) return 'vazio';

    // 1. E-mail
    if (str.includes('@')) return 'email';

    // 2. Chave Aleatória (UUID ou chave alfanumérica sem @)
    const temLetras = /[a-zA-Z]/.test(str);
    if (temLetras) return 'aleatoria';

    const digits = str.replace(/\D/g, '');
    if (!digits) return 'vazio';

    // 3. CNPJ (mais de 11 dígitos numéricos)
    if (digits.length > 11) return 'cnpj';

    // 4. Se possui parênteses de telefone: celular
    if (str.startsWith('(') || str.includes(')')) return 'celular';

    // 5. No Brasil, celular SEMPRE tem 3º dígito = 9 (ex: DDD 9XXXX-XXXX)
    if (digits.length >= 3 && digits[2] === '9') {
      return 'celular';
    }

    // 6. Se já possui formatação de CPF
    if (str.includes('.')) return 'cpf';

    // 7. Se o 3º dígito não for 9 (ex: CPF do organizador 828...)
    if (digits.length >= 3 && digits[2] !== '9') {
      return 'cpf';
    }

    return digits.length > 0 ? 'cpf' : 'vazio';
  },

  /**
   * Retorna o texto formatado para Chave PIX (CPF, Celular, CNPJ, E-mail ou Chave Aleatória)
   */
  formatarChavePix(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (!str) return '';

    // E-mail: preserva minúsculo
    if (str.includes('@')) return str.toLowerCase();

    // Chave Aleatória (UUID)
    const temLetras = /[a-zA-Z]/.test(str);
    if (temLetras) return str;

    const digits = str.replace(/\D/g, '').slice(0, 14);
    if (!digits) return '';

    // CNPJ (mais de 11 dígitos)
    if (digits.length > 11) {
      return this.formatarCNPJ(digits);
    }

    // Se já estiver explicitamente iniciado como telefone
    if (str.startsWith('(')) {
      return this.formatarTelefone(digits);
    }

    // Se tiver 3 ou mais dígitos e o 3º dígito for 9 -> Celular com DDD no Brasil!
    if (digits.length >= 3 && digits[2] === '9') {
      return this.formatarTelefone(digits);
    }

    // Se o 3º dígito NÃO for 9 (ex: 828... do CPF do organizador):
    // É com 100% de certeza CPF!
    if (digits.length >= 3 && digits[2] !== '9') {
      return this.formatarCPF(digits);
    }

    // Menos de 3 dígitos: preserva os dígitos crus para não presumir máscara precipitadamente
    return digits;
  },

  /**
   * Formata telefone se contiver apenas números/símbolos de telefone, senão mantém texto original
   */
  formatarTelefoneOuTexto(val) {
    if (!val) return '';
    const trimmed = String(val).trim();
    const digits = trimmed.replace(/\D/g, '');
    const temLetras = /[a-zA-Z]/.test(trimmed);

    if (!temLetras && digits.length >= 2) {
      if (digits.length === 11 && digits[2] !== '9') {
        return this.formatarCPF(digits);
      }
      return this.formatarTelefone(digits);
    }
    return trimmed;
  },

  /**
   * Vincula máscara a um elemento de input de forma fluida, preservando a posição do cursor
   */
  aplicarMascaraInput(inputEl, formatadorFn) {
    if (!inputEl) return;

    const aplicar = () => {
      const val = inputEl.value;
      const pos = inputEl.selectionEnd || val.length;
      const rawPosAntes = val.slice(0, pos).replace(/\D/g, '').length;

      const formatted = formatadorFn(val);
      if (formatted === val) return;

      inputEl.value = formatted;

      // Preserva a posição relativa do cursor
      let rawCont = 0;
      let newPos = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          rawCont++;
          if (rawCont === rawPosAntes) {
            newPos = i + 1;
            break;
          }
        }
      }
      try {
        inputEl.setSelectionRange(newPos, newPos);
      } catch (e) {}
    };

    inputEl.addEventListener('input', aplicar);
    inputEl.addEventListener('paste', () => setTimeout(aplicar, 10));
    inputEl.addEventListener('blur', () => {
      inputEl.value = formatadorFn(inputEl.value);
    });
  }
};

if (typeof window !== 'undefined') {
  window.MaskUtils = MaskUtils;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MaskUtils = MaskUtils;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MaskUtils;
}
