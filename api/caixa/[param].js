/**
 * SenaClube — Proxy Serverless da API da Caixa Econômica Federal
 * Suporte a múltiplos espelhos de contingência com timeouts estritos,
 * validação de integridade das dezenas e correspondência do concurso requisitado.
 */

function validarDezenasConcurso(dezenas) {
  if (!Array.isArray(dezenas) || dezenas.length !== 6) return null;
  const normalizadas = [];
  for (const d of dezenas) {
    const num = parseInt(d, 10);
    if (isNaN(num) || num < 1 || num > 60 || normalizadas.includes(num)) {
      return null;
    }
    normalizadas.push(num);
  }
  return normalizadas.sort((a, b) => a - b).map(n => String(n).padStart(2, '0'));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { param } = req.query;
  let numero = '';
  let numeroEsperado = null;

  if (param && param !== 'ultimo' && param !== '[param]') {
    const parsed = parseInt(param, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 99999) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetro de concurso inválido. Deve ser um número inteiro positivo ou "ultimo".'
      });
    }
    numero = String(parsed);
    numeroEsperado = parsed;
  }

  // 1. Busca Oficial Caixa
  const urlCaixa = numero
    ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${numero}`
    : `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena`;

  const ctrlCaixa = new AbortController();
  const timeoutCaixa = setTimeout(() => ctrlCaixa.abort(), 5000);

  try {
    const caixaRes = await fetch(urlCaixa, {
      signal: ctrlCaixa.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutCaixa);

    if (caixaRes.ok) {
      const data = await caixaRes.json();
      const numRetornado = parseInt(data.numero, 10);
      const dezenasValidadas = validarDezenasConcurso(data.listaDezenas || data.dezenasSorteadasOrdemSorteio);

      if (numRetornado && (!numeroEsperado || numRetornado === numeroEsperado) && dezenasValidadas) {
        return res.status(200).json({
          success: true,
          data: {
            numero: numRetornado,
            dataApuracao: data.dataApuracao || '',
            dezenas: dezenasValidadas,
            acumulado: !!data.acumulado,
            valorAcumuladoProximoConcurso: data.valorAcumuladoProximoConcurso || 0,
            nomeMunicipioUFSorteio: data.nomeMunicipioUFSorteio || '',
            fonte: 'oficial_caixa'
          }
        });
      }
    }
  } catch (err) {
    clearTimeout(timeoutCaixa);
  }

  // 2. Espelho Contingência Guidi
  try {
    const guidiUrl = numero
      ? `https://api.guidi.dev.br/loteria/megasena/${numero}`
      : `https://api.guidi.dev.br/loteria/megasena/ultimo`;

    const ctrlGuidi = new AbortController();
    const timeoutGuidi = setTimeout(() => ctrlGuidi.abort(), 5000);

    const gRes = await fetch(guidiUrl, { signal: ctrlGuidi.signal });
    clearTimeout(timeoutGuidi);

    if (gRes.ok) {
      const gData = await gRes.json();
      const numRetornado = parseInt(gData.numero, 10);
      const dezenasValidadas = validarDezenasConcurso(gData.listaDezenas || gData.dezenasSorteadasOrdemSorteio);

      if (numRetornado && (!numeroEsperado || numRetornado === numeroEsperado) && dezenasValidadas) {
        return res.status(200).json({
          success: true,
          data: {
            numero: numRetornado,
            dataApuracao: gData.dataApuracao || '',
            dezenas: dezenasValidadas,
            acumulado: !!gData.acumulado,
            valorAcumuladoProximoConcurso: gData.valorAcumuladoProximoConcurso || 0,
            nomeMunicipioUFSorteio: gData.nomeMunicipioUFSorteio || '',
            fonte: 'espelho_guidi'
          }
        });
      }
    }
  } catch (err) {}

  // 3. Espelho Contingência Heroku
  try {
    const mirrorUrl = numero
      ? `https://loteriascaixa-api.herokuapp.com/api/megasena/${numero}`
      : `https://loteriascaixa-api.herokuapp.com/api/megasena/latest`;

    const ctrlMirror = new AbortController();
    const timeoutMirror = setTimeout(() => ctrlMirror.abort(), 5000);

    const mirrorRes = await fetch(mirrorUrl, { signal: ctrlMirror.signal });
    clearTimeout(timeoutMirror);

    if (mirrorRes.ok) {
      const mData = await mirrorRes.json();
      const numRetornado = parseInt(mData.concurso || mData.numero, 10);
      const dezenasValidadas = validarDezenasConcurso(mData.dezenas);

      if (numRetornado && (!numeroEsperado || numRetornado === numeroEsperado) && dezenasValidadas) {
        return res.status(200).json({
          success: true,
          data: {
            numero: numRetornado,
            dataApuracao: mData.data || mData.dataApuracao || '',
            dezenas: dezenasValidadas,
            acumulado: !!(mData.acumulou || mData.acumulado),
            valorAcumuladoProximoConcurso: mData.valorAcumuladoProximoConcurso || 0,
            nomeMunicipioUFSorteio: mData.local || '',
            fonte: 'espelho_loterias'
          }
        });
      }
    }
  } catch (err) {}

  return res.status(502).json({
    success: false,
    error: 'Não foi possível consultar a Caixa ou espelhos no momento com dados válidos.'
  });
}
