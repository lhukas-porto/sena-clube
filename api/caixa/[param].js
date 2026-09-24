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
    return res.status(502).json({
      success: false,
      error: 'Não foi possível consultar a Caixa neste momento.',
      details: err.message
    });
  }
}
