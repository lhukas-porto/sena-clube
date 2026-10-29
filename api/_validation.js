/**
 * SenaClube — Módulo Central de Validação e Sanitização de Dados
 * Garante tipagem estrita, limites numéricos (01 a 60), ausência de duplicatas,
 * integridade financeira e normalização de dezenas.
 */

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

/**
 * Valida se um valor de dezena é estritamente válido (número inteiro de 1 a 60)
 * Rejeita strings com sufixos alfanuméricos como '1abc', HTML ou negativos
 * @param {any} dez 
 * @returns {{ valid: boolean, value?: number }}
 */
export function validateAndNormalizeDezena(dez) {
  if (typeof dez === 'number') {
    if (Number.isInteger(dez) && dez >= 1 && dez <= 60) {
      return { valid: true, value: dez };
    }
    return { valid: false };
  }

  if (typeof dez === 'string') {
    const trimmed = dez.trim();
    if (!/^(0?[1-9]|[1-5][0-9]|60)$/.test(trimmed)) {
      return { valid: false };
    }
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= 60) {
      return { valid: true, value: num };
    }
  }

  return { valid: false };
}

/**
 * Validação abrangente de integridade do payload do Bolão
 * @param {any} body 
 * @returns {{ valid: boolean, error?: string, normalizedPayload?: any }}
 */
export function validateBolaoPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Corpo da requisição deve ser um objeto JSON válido.' };
  }

  if (typeof body.nomeBolao !== 'string' || body.nomeBolao.trim().length === 0) {
    return { valid: false, error: 'O nome do bolão é obrigatório.' };
  }

  // Validação da taxa global do organizador (se fornecida)
  if (body.taxaOrganizadorGlobal !== undefined && body.taxaOrganizadorGlobal !== null) {
    if (typeof body.taxaOrganizadorGlobal !== 'number' || isNaN(body.taxaOrganizadorGlobal) || body.taxaOrganizadorGlobal < 0 || body.taxaOrganizadorGlobal > 1) {
      return { valid: false, error: 'A taxa global do organizador deve ser um número entre 0.0 (0%) e 1.0 (100%).' };
    }
  }

  if (!Array.isArray(body.ciclos) || body.ciclos.length === 0) {
    return { valid: false, error: 'O bolão deve conter pelo menos uma edição (ciclo) em formato de lista (array).' };
  }

  const cicloIds = new Set();

  for (let i = 0; i < body.ciclos.length; i++) {
    const ciclo = body.ciclos[i];
    if (!ciclo || typeof ciclo !== 'object' || Array.isArray(ciclo)) {
      return { valid: false, error: `Edição no índice ${i} deve ser um objeto válido.` };
    }

    if (ciclo.id === undefined || ciclo.id === null || String(ciclo.id).trim().length === 0) {
      return { valid: false, error: `Edição no índice ${i} possui ID ausente.` };
    }

    const cicloIdStr = String(ciclo.id);
    if (cicloIds.has(cicloIdStr)) {
      return { valid: false, error: `ID de edição duplicado detectado: "${cicloIdStr}".` };
    }
    cicloIds.add(cicloIdStr);

    if (typeof ciclo.nome !== 'string' || ciclo.nome.trim().length === 0) {
      return { valid: false, error: `Edição "${cicloIdStr}" possui nome inválido.` };
    }

    // Taxa do organizador do ciclo
    if (ciclo.taxaOrganizador !== undefined && ciclo.taxaOrganizador !== null) {
      if (typeof ciclo.taxaOrganizador !== 'number' || isNaN(ciclo.taxaOrganizador) || ciclo.taxaOrganizador < 0 || ciclo.taxaOrganizador > 1) {
        return { valid: false, error: `A taxa da edição "${ciclo.nome}" deve ser um número entre 0.0 (0%) e 1.0 (100%).` };
      }
    }

    // Valor da cota
    if (ciclo.valorCota !== undefined && ciclo.valorCota !== null) {
      if (typeof ciclo.valorCota !== 'number' || isNaN(ciclo.valorCota) || ciclo.valorCota < 0) {
        return { valid: false, error: `Valor da cota na edição "${ciclo.nome}" deve ser um número positivo ou zero.` };
      }
    }

    // Prêmio da quadra
    if (ciclo.premioQuadra !== undefined && ciclo.premioQuadra !== null) {
      if (typeof ciclo.premioQuadra !== 'number' || isNaN(ciclo.premioQuadra) || ciclo.premioQuadra < 0) {
        return { valid: false, error: `Prêmio da quadra na edição "${ciclo.nome}" deve ser um número positivo ou zero.` };
      }
    }

    // Validação estrita do array de apostas
    if (ciclo.apostas !== undefined && ciclo.apostas !== null) {
      if (!Array.isArray(ciclo.apostas)) {
        return { valid: false, error: `O campo "apostas" na edição "${ciclo.nome}" deve ser uma lista (array), não texto ou outro tipo.` };
      }

      const apostaIds = new Set();
      for (let j = 0; j < ciclo.apostas.length; j++) {
        const ap = ciclo.apostas[j];
        if (!ap || typeof ap !== 'object' || Array.isArray(ap)) {
          return { valid: false, error: `Aposta no índice ${j + 1} da edição "${ciclo.nome}" é inválida.` };
        }

        if (typeof ap.nome !== 'string' || ap.nome.trim().length === 0) {
          return { valid: false, error: `Aposta ${j + 1} da edição "${ciclo.nome}" não possui nome válido.` };
        }

        if (ap.id) {
          const aIdStr = String(ap.id);
          if (apostaIds.has(aIdStr)) {
            return { valid: false, error: `ID de aposta duplicado detectado: "${aIdStr}" na edição "${ciclo.nome}".` };
          }
          apostaIds.add(aIdStr);
        }

        if (!Array.isArray(ap.dezenas) || ap.dezenas.length !== 6) {
          return { valid: false, error: `A aposta de "${ap.nome}" deve conter exatamente 6 dezenas.` };
        }

        const normalizedNums = [];
        for (const dez of ap.dezenas) {
          const check = validateAndNormalizeDezena(dez);
          if (!check.valid) {
            return {
              valid: false,
              error: `Dezena "${dez}" na aposta de "${ap.nome}" é inválida. O formato permitido é estritamente numérico de 01 a 60.`
            };
          }
          if (normalizedNums.includes(check.value)) {
            return { valid: false, error: `A aposta de "${ap.nome}" possui dezenas repetidas (${check.value}).` };
          }
          normalizedNums.push(check.value);
        }

        // Normalização garantida: dezenas como números inteiros ordenados
        ap.dezenas = normalizedNums.sort((a, b) => a - b);
      }
    }

    // Validação estrita do array de concursos
    if (ciclo.concursos !== undefined && ciclo.concursos !== null) {
      if (!Array.isArray(ciclo.concursos)) {
        return { valid: false, error: `O campo "concursos" na edição "${ciclo.nome}" deve ser uma lista (array).` };
      }

      const concNumeros = new Set();
      for (const conc of ciclo.concursos) {
        if (!conc || typeof conc !== 'object' || Array.isArray(conc)) {
          return { valid: false, error: `Concurso inválido detectado na edição "${ciclo.nome}".` };
        }

        const cNum = parseInt(conc.numero, 10);
        if (isNaN(cNum) || cNum <= 0) {
          return { valid: false, error: `Número de concurso inválido detectado na edição "${ciclo.nome}".` };
        }
        if (concNumeros.has(cNum)) {
          return { valid: false, error: `Concurso ${cNum} duplicado na edição "${ciclo.nome}".` };
        }
        concNumeros.add(cNum);
        conc.numero = cNum;

        if (!Array.isArray(conc.dezenas) || conc.dezenas.length !== 6) {
          return { valid: false, error: `Concurso ${conc.numero} deve ter exatamente 6 dezenas sorteadas.` };
        }

        const normConcDez = [];
        for (const cDez of conc.dezenas) {
          const check = validateAndNormalizeDezena(cDez);
          if (!check.valid) {
            return {
              valid: false,
              error: `Dezena sorteadas "${cDez}" no concurso ${conc.numero} é inválida. O intervalo permitido é de 01 a 60.`
            };
          }
          if (normConcDez.includes(check.value)) {
            return { valid: false, error: `Concurso ${conc.numero} possui dezenas repetidas (${check.value}).` };
          }
          normConcDez.push(check.value);
        }

        conc.dezenas = normConcDez.sort((a, b) => a - b);
      }
    }
  }

  return { valid: true };
}
