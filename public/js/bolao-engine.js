/**
 * SenaClube — Motor de Regras e Apuração do Bolão (BolaoEngine)
 * Gerencia ciclo de sorteios, acertos acumulados, cores por concurso,
 * regras financeiras (taxa de 20% do organizador, prêmio da quadra dedutível e prêmio da sena)
 * e comparação inteligente de apostas entre ciclos.
 */

const PALETA_CONCURSOS = [
  { bg: '#facc15', text: '#1a1600', name: 'Amarelo Ouro' },      // 1º Concurso
  { bg: '#10b981', text: '#ffffff', name: 'Verde Esmeralda' },  // 2º Concurso
  { bg: '#06b6d4', text: '#00222a', name: 'Ciano Elétrico' },   // 3º Concurso
  { bg: '#f97316', text: '#ffffff', name: 'Laranja Solar' },    // 4º Concurso
  { bg: '#f43f5e', text: '#ffffff', name: 'Rosa Carmim' },      // 5º Concurso
  { bg: '#38bdf8', text: '#001e33', name: 'Azul Celeste' },     // 6º Concurso
  { bg: '#a3e635', text: '#132200', name: 'Verde Lima' },       // 7º Concurso
  { bg: '#c084fc', text: '#1c0033', name: 'Lavanda Brilhante' },// 8º Concurso
  { bg: '#fb7185', text: '#ffffff', name: 'Coral Suave' },      // 9º Concurso
  { bg: '#e879f9', text: '#2e0036', name: 'Magenta Vivo' }      // 10º Concurso
];

const BolaoEngine = {
  getCorConcurso(index) {
    const paleta = PALETA_CONCURSOS[index % PALETA_CONCURSOS.length];
    return {
      bg: paleta.bg,
      text: paleta.text,
      nome: paleta.name
    };
  },

  apurar(apostas = [], concursos = []) {
    const dezenasSorteadasInfo = new Map();

    concursos.forEach((conc, cIdx) => {
      const estilo = this.getCorConcurso(cIdx);
      (conc.dezenas || []).forEach(dez => {
        const dezStr = dez.toString().padStart(2, '0');
        if (!dezenasSorteadasInfo.has(dezStr)) {
          dezenasSorteadasInfo.set(dezStr, {
            concursoNumero: conc.numero,
            concursoIndex: cIdx,
            dataApuracao: conc.dataApuracao,
            bg: estilo.bg,
            text: estilo.text
          });
        }
      });
    });

    let maiorPontuacao = 0;
    let apostasLideres = [];
    const ganhadoresSena = [];
    const ganhadoresQuadraPrimeiroSorteio = [];

    const primeiroConcurso = concursos.length > 0 ? concursos[0] : null;
    const dezenasPrimeiroConcurso = new Set(
      primeiroConcurso ? primeiroConcurso.dezenas.map(d => d.toString().padStart(2, '0')) : []
    );

    const apostasApuradas = apostas.map(aposta => {
      const dezenasDetalhes = (aposta.dezenas || []).map(num => {
        const numStr = num.toString().padStart(2, '0');
        const hitInfo = dezenasSorteadasInfo.get(numStr);

        return {
          numero: numStr,
          acertou: !!hitInfo,
          concursoNumero: hitInfo ? hitInfo.concursoNumero : null,
          concursoIndex: hitInfo ? hitInfo.concursoIndex : null,
          bg: hitInfo ? hitInfo.bg : null,
          text: hitInfo ? hitInfo.text : null
        };
      });

      const totalAcertos = dezenasDetalhes.filter(d => d.acertou).length;

      let acertosNoPrimeiroSorteio = 0;
      if (primeiroConcurso) {
        acertosNoPrimeiroSorteio = dezenasDetalhes.filter(d => dezenasPrimeiroConcurso.has(d.numero)).length;
      }

      const itemApurado = {
        ...aposta,
        dezenasDetalhes,
        totalAcertos,
        acertosNoPrimeiroSorteio,
        isSenaWinner: totalAcertos >= 6,
        isQuadraFirstRound: acertosNoPrimeiroSorteio >= 4
      };

      if (totalAcertos > maiorPontuacao) {
        maiorPontuacao = totalAcertos;
      }

      if (itemApurado.isSenaWinner) {
        ganhadoresSena.push(itemApurado);
      }

      if (itemApurado.isQuadraFirstRound) {
        ganhadoresQuadraPrimeiroSorteio.push(itemApurado);
      }

      return itemApurado;
    });

    apostasLideres = apostasApuradas.filter(a => a.totalAcertos === maiorPontuacao && maiorPontuacao > 0);

    return {
      apostas: apostasApuradas,
      maiorPontuacao,
      apostasLideres,
      ganhadoresSena,
      ganhadoresQuadraPrimeiroSorteio,
      temVencedorSena: ganhadoresSena.length > 0,
      temVencedorQuadraPrimeiroSorteio: ganhadoresQuadraPrimeiroSorteio.length > 0
    };
  },

  /**
   * Calcula totais financeiros com dedução de 20% do organizador e dedução da Quadra quando premiada
   * @param {Array} apostas Lista de apostas
   * @param {number} valorCota Valor de cada jogo
   * @param {number} percentualOrganizador Percentual da taxa do organizador
   * @param {number} premioQuadraConfig Valor estipulado para a quadra no 1º sorteio
   * @param {boolean} quadraPremiada Se houve ganhador da quadra na abertura
   */
  calcularFinanceiro(apostas = [], valorCota = 24.0, percentualOrganizador = 0.20, premioQuadraConfig = 0.0, quadraPremiada = false) {
    const totalApostas = apostas.length;
    const pagas = apostas.filter(a => a.pago).length;
    const pendentes = totalApostas - pagas;

    // Valores Brutos
    const totalArrecadadoBruto = pagas * valorCota;
    const totalPendenteBruto = pendentes * valorCota;
    const totalGeralPrevisto = totalApostas * valorCota;

    // Taxa do Organizador (20%)
    const valorOrganizadorArrecadado = totalArrecadadoBruto * percentualOrganizador;
    const valorOrganizadorPrevisto = totalGeralPrevisto * percentualOrganizador;

    // Total Líquido Geral (Bruto - 20%)
    const totalLiquidoGeralArrecadado = totalArrecadadoBruto - valorOrganizadorArrecadado;
    const totalLiquidoGeralPrevisto = totalGeralPrevisto - valorOrganizadorPrevisto;

    // Regra da Quadra: Se for premiada, retira o valor dela do total líquido
    const valorPremioQuadraConfig = typeof premioQuadraConfig === 'number' ? premioQuadraConfig : 0.0;
    let valorPagoQuadra = 0.0;
    
    if (quadraPremiada && valorPremioQuadraConfig > 0) {
      // Deduz o prêmio da quadra do montante líquido
      valorPagoQuadra = Math.min(valorPremioQuadraConfig, totalLiquidoGeralArrecadado);
    }

    // Prêmio Líquido da Sena (Total Líquido menos o Prêmio da Quadra)
    const premioSenaLiquido = totalLiquidoGeralArrecadado - valorPagoQuadra;
    const premioSenaPrevisto = totalLiquidoGeralPrevisto - (quadraPremiada ? valorPremioQuadraConfig : 0.0);

    const nomesUnicos = new Set(apostas.map(a => a.nome.trim().toLowerCase())).size;

    return {
      totalApostas,
      totalApostadores: nomesUnicos,
      pagas,
      pendentes,
      valorCota,
      percentualOrganizador,
      percentualFormatado: `${Math.round(percentualOrganizador * 100)}%`,
      
      // Valores Brutos
      totalArrecadadoBruto,
      totalPendenteBruto,
      totalGeralPrevisto,

      // Retenção do Organizador
      valorOrganizadorArrecadado,
      valorOrganizadorPrevisto,

      // Total Líquido Geral
      totalLiquidoGeralArrecadado,
      totalLiquidoGeralPrevisto,

      // Informações da Quadra
      premioQuadraConfig: valorPremioQuadraConfig,
      quadraPremiada: !!quadraPremiada,
      valorPagoQuadra,

      // Prêmio Final da Sena (Líquido após dedução da Quadra)
      premioSenaLiquido,
      premioSenaPrevisto,
      
      // Compatibilidade
      premioLiquidoArrecadado: totalLiquidoGeralArrecadado
    };
  },

  compararComCicloAnterior(apostasBase = [], novasApostas = []) {
    const chaveAposta = (nome, dezenas) => {
      const n = (nome || '').trim().toLowerCase();
      const d = [...(dezenas || [])].map(x => x.toString().padStart(2, '0')).sort().join('-');
      return `${n}::${d}`;
    };

    const mapaBase = new Map();
    apostasBase.forEach(a => {
      const key = chaveAposta(a.nome, a.dezenas);
      if (!mapaBase.has(key)) mapaBase.set(key, []);
      mapaBase.get(key).push(a);
    });

    const mantidas = [];
    const alteradas = [];
    const novas = [];
    const idsUsados = new Set();

    novasApostas.forEach(nova => {
      const key = chaveAposta(nova.nome, nova.dezenas);
      const listaExata = mapaBase.get(key);

      if (listaExata && listaExata.length > 0) {
        // Jogo Exato (Já existente no bolão)
        const apostaExistente = listaExata.shift();
        idsUsados.add(apostaExistente.id);
        mantidas.push({
          ...nova,
          statusComparacao: 'mantida',
          apostaExistenteId: apostaExistente.id,
          apostaExistente
        });
      } else {
        // Verifica se é um participante já existente na base que alterou as dezenas
        const mesmoParticipante = apostasBase.find(a => 
          !idsUsados.has(a.id) && a.nome.trim().toLowerCase() === nova.nome.trim().toLowerCase()
        );

        if (mesmoParticipante) {
          idsUsados.add(mesmoParticipante.id);
          alteradas.push({
            ...nova,
            statusComparacao: 'alterada',
            apostaExistenteId: mesmoParticipante.id,
            apostaExistente: mesmoParticipante,
            dezenasAnteriores: [...mesmoParticipante.dezenas]
          });
        } else {
          // Novo participante
          novas.push({
            ...nova,
            statusComparacao: 'nova'
          });
        }
      }
    });

    const naoRenovadas = apostasBase.filter(ant => !idsUsados.has(ant.id));

    return {
      mantidas,
      alteradas,
      novas,
      adicionadas: [...alteradas, ...novas],
      naoRenovadas,
      totalMantidas: mantidas.length,
      totalAlteradas: alteradas.length,
      totalNovas: novas.length,
      totalAdicionadas: alteradas.length + novas.length,
      totalNaoRenovadas: naoRenovadas.length
    };
  }
};

window.BolaoEngine = BolaoEngine;
