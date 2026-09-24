/**
 * SenaClube — Módulo WhatsApp Parser
 * Extrai apostas e dezenas a partir de textos recebidos via mensagens de WhatsApp
 */

const WhatsAppParser = {
  /**
   * Analisa um bloco de texto bruto e extrai apostas válidas
   * @param {string} rawText Texto bruto colado
   * @param {boolean} defaultPago Se as apostas devem vir como pagas por padrão
   * @returns {Array<{nome: string, dezenas: string[], pago: boolean}>}
   */
  parse(rawText, defaultPago = false) {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const apostas = [];

    let currentName = 'Apostador';

    for (let line of lines) {
      // Remove carimbos de data/hora típicos de export do WhatsApp: [12:34, 15/01/2026] Nome:
      const cleanLine = line
        .replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?(?:,\s*\d{1,2}\/\d{1,2}\/\d{2,4})?\]?\s*/, '')
        .trim();

      // Procura todos os números na linha
      const numberMatches = cleanLine.match(/\b\d{1,2}\b/g);

      if (numberMatches) {
        // Converte e valida números de 1 a 60
        const validNumbers = [];
        for (let numStr of numberMatches) {
          const n = parseInt(numStr, 10);
          if (n >= 1 && n <= 60 && !validNumbers.includes(n)) {
            validNumbers.push(n);
          }
        }

        // Se encontramos 6 dezenas válidas
        if (validNumbers.length === 6) {
          // Extrai o nome removendo os números e caracteres especiais
          let nomeExtraido = cleanLine
            .replace(/\b\d{1,2}\b/g, '')
            .replace(/[:\-–—,\(\)\[\]{}]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Se tiver nome na linha, atualiza o nome corrente
          if (nomeExtraido.length >= 2) {
            currentName = nomeExtraido;
          }

          // Ordena as 6 dezenas de forma crescente
          validNumbers.sort((a, b) => a - b);
          const dezenasFormatadas = validNumbers.map(n => n < 10 ? `0${n}` : `${n}`);

          apostas.push({
            id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
            nome: currentName,
            dezenas: dezenasFormatadas,
            pago: !!defaultPago,
            criadoEm: new Date().toISOString()
          });
          continue;
        }

        // Se a linha tem múltiplos de 6 (ex: 12 números = 2 jogos)
        if (validNumbers.length > 6 && validNumbers.length % 6 === 0) {
          let nomeExtraido = cleanLine
            .replace(/\b\d{1,2}\b/g, '')
            .replace(/[:\-–—,\(\)\[\]{}]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (nomeExtraido.length >= 2) currentName = nomeExtraido;

          for (let i = 0; i < validNumbers.length; i += 6) {
            const jogo = validNumbers.slice(i, i + 6).sort((a, b) => a - b);
            apostas.push({
              id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36) + i,
              nome: currentName,
              dezenas: jogo.map(n => n < 10 ? `0${n}` : `${n}`),
              pago: !!defaultPago,
              criadoEm: new Date().toISOString()
            });
          }
          continue;
        }
      }

      // Se a linha não tinha 6 dezenas mas parece ser um nome (ex: "Jogos do Carlos:")
      const possibleName = cleanLine.replace(/[:\-–—]+/g, '').trim();
      if (possibleName.length >= 2 && !/\d{2,}/.test(possibleName)) {
        currentName = possibleName;
      }
    }

    return apostas;
  }
};

window.WhatsAppParser = WhatsAppParser;
