/**
 * SenaClube — Módulo de Integração com a API da Caixa Econômica Federal
 */

const CaixaAPI = {
  /**
   * Busca os dados de um concurso específico ou do último apurado
   * @param {number|null} numeroConcurso
   * @returns {Promise<{numero: number, dataApuracao: string, dezenas: string[]}>}
   */
  async buscarConcurso(numeroConcurso = null) {
    const endpoint = numeroConcurso ? `/api/caixa/${numeroConcurso}` : `/api/caixa/ultimo`;
    
    try {
      const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' }
      });
      
      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || resData.details || 'Falha ao buscar dados na Caixa');
      }

      // Normaliza as dezenas para números inteiros ordenados ou strings formatadas "01"-"60"
      const dezenasFormatadas = (resData.data.dezenas || []).map(d => {
        const num = parseInt(d, 10);
        return num < 10 ? `0${num}` : `${num}`;
      }).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      return {
        numero: resData.data.numero,
        dataApuracao: resData.data.dataApuracao || 'Não informada',
        dezenas: dezenasFormatadas,
        acumulado: resData.data.acumulado,
        valorAcumulado: resData.data.valorAcumuladoProximoConcurso
      };
    } catch (err) {
      console.warn('[CaixaAPI] Erro ao consultar backend local:', err.message);
      throw err;
    }
  }
};

window.CaixaAPI = CaixaAPI;
