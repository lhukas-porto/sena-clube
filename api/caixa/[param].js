export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { param } = req.query;
  const numero = (param === 'ultimo' || !param) ? '' : param;
  const url = numero
    ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${numero}`
    : `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const caixaRes = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);

    if (!caixaRes.ok) {
      throw new Error(`Status Caixa ${caixaRes.status}`);
    }

    const data = await caixaRes.json();
    const result = {
      numero: data.numero,
      dataApuracao: data.dataApuracao,
      dezenas: data.listaDezenas || data.dezenasSorteadasOrdemSorteio || [],
      acumulado: data.acumulado,
      valorAcumuladoProximoConcurso: data.valorAcumuladoProximoConcurso,
      nomeMunicipioUFSorteio: data.nomeMunicipioUFSorteio || '',
      fonte: 'oficial_caixa'
    };

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[Caixa Vercel API] Falha na busca primária (${url}):`, err.message);

    // 2. Tenta espelho Guidi
    try {
      const guidiUrl = numero
        ? `https://api.guidi.dev.br/loteria/megasena/${numero}`
        : `https://api.guidi.dev.br/loteria/megasena/ultimo`;
      const gRes = await fetch(guidiUrl);
      if (gRes.ok) {
        const gData = await gRes.json();
        return res.status(200).json({
          success: true,
          data: {
            numero: gData.numero,
            dataApuracao: gData.dataApuracao || '',
            dezenas: gData.listaDezenas || gData.dezenasSorteadasOrdemSorteio || [],
            acumulado: gData.acumulado || false,
            valorAcumuladoProximoConcurso: gData.valorAcumuladoProximoConcurso || 0,
            nomeMunicipioUFSorteio: gData.nomeMunicipioUFSorteio || '',
            fonte: 'espelho_guidi'
          }
        });
      }
    } catch (guidiErr) {
      console.warn('[Caixa Vercel API] Falha no espelho Guidi:', guidiErr.message);
    }

    // 3. Tenta espelho Heroku
    try {
      const mirrorUrl = numero
        ? `https://loteriascaixa-api.herokuapp.com/api/megasena/${numero}`
        : `https://loteriascaixa-api.herokuapp.com/api/megasena/latest`;
      const mirrorRes = await fetch(mirrorUrl);
      if (mirrorRes.ok) {
        const mData = await mirrorRes.json();
        return res.status(200).json({
          success: true,
          data: {
            numero: mData.concurso || mData.numero,
            dataApuracao: mData.data || mData.dataApuracao || '',
            dezenas: mData.dezenas || [],
            acumulado: mData.acumulou || false,
            valorAcumuladoProximoConcurso: mData.valorAcumuladoProximoConcurso || 0,
            nomeMunicipioUFSorteio: mData.local || '',
            fonte: 'espelho_loterias'
          }
        });
      }
    } catch (mirrorErr) {
      console.warn('[Caixa Vercel API] Falha no espelho secundário:', mirrorErr.message);
    }

    return res.status(502).json({
      success: false,
      error: 'Não foi possível consultar a Caixa neste momento.',
      details: err.message
    });
  }
}
