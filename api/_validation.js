/**
 * Sanitiza recursivamente strings para garantir UTF-8 válido (toWellFormed)
 * Previne erros de "Empty or invalid json" (PGRST102) no PostgreSQL/Supabase
 */
export function sanitizePayload(obj) {
  if (typeof obj === 'string') {
    return typeof obj.toWellFormed === 'function'
      ? obj.toWellFormed()
      : obj.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizePayload);
  }
  if (obj && typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizePayload(v);
    }
    return res;
  }
  return obj;
}

export function validateBolaoPayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Corpo da requisição deve ser um objeto JSON válido.' };
  }

  if (typeof body.nomeBolao !== 'string' || body.nomeBolao.trim().length === 0) {
    return { valid: false, error: 'O nome do bolão é obrigatório.' };
  }

  if (!Array.isArray(body.ciclos) || body.ciclos.length === 0) {
    return { valid: false, error: 'O bolão deve conter pelo menos uma edição (ciclo).' };
  }

  for (let i = 0; i < body.ciclos.length; i++) {
    const ciclo = body.ciclos[i];
    if (!ciclo.id || !ciclo.nome) {
      return { valid: false, error: `Edição no índice ${i} possui dados incompletos (id ou nome ausente).` };
    }

    if (ciclo.valorCota !== undefined && (typeof ciclo.valorCota !== 'number' || ciclo.valorCota < 0)) {
      return { valid: false, error: `Valor da cota na edição ${ciclo.nome} deve ser um número positivo.` };
    }

    if (Array.isArray(ciclo.apostas)) {
      for (let j = 0; j < ciclo.apostas.length; j++) {
        const ap = ciclo.apostas[j];
        if (!ap.nome || typeof ap.nome !== 'string' || ap.nome.trim().length === 0) {
          return { valid: false, error: `Aposta ${j + 1} da edição ${ciclo.nome} não possui nome do apostador.` };
        }

        if (!Array.isArray(ap.dezenas) || ap.dezenas.length !== 6) {
          return { valid: false, error: `A aposta de "${ap.nome}" deve conter exatamente 6 dezenas.` };
        }

        const nums = [];
        for (const dez of ap.dezenas) {
          const n = parseInt(dez, 10);
          if (isNaN(n) || n < 1 || n > 60) {
            return { valid: false, error: `Dezena "${dez}" na aposta de "${ap.nome}" é inválida. O intervalo permitido é de 01 a 60.` };
          }
          if (nums.includes(n)) {
            return { valid: false, error: `A aposta de "${ap.nome}" possui dezenas repetidas (${n}).` };
          }
          nums.push(n);
        }
      }
    }

    if (Array.isArray(ciclo.concursos)) {
      for (const conc of ciclo.concursos) {
        if (!conc.numero || typeof conc.numero !== 'number' || conc.numero <= 0) {
          return { valid: false, error: `Número de concurso inválido detectado na edição ${ciclo.nome}.` };
        }
        if (!Array.isArray(conc.dezenas) || conc.dezenas.length !== 6) {
          return { valid: false, error: `Concurso ${conc.numero} deve ter exatamente 6 dezenas sorteadas.` };
        }
      }
    }
  }

  return { valid: true };
}
