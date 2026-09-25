/**
 * SenaClube — Módulo de Exportação e Compartilhamento (v2.3)
 * Gera relatórios estruturados para envio no WhatsApp com detalhamento dos 20% do organizador,
 * prêmio da Quadra deduzido e prêmio líquido da Sena.
 */

const ExportShare = {
  gerarRelatorioWhatsApp(dadosBolao, apuracao, financeiro, cicloAtual) {
    const dataHora = new Date().toLocaleDateString('pt-BR');
    const nomeBolao = dadosBolao.nomeBolao || 'SENACLUBE';
    const { concursos } = cicloAtual;
    const { apostas, ganhadoresSena, ganhadoresQuadraPrimeiroSorteio } = apuracao;
    const nomeEdicaoFormatado = (cicloAtual.nome || 'Edição 1').replace(/Ciclo\s*/i, 'Edição ');

    let msg = `🍀 *${nomeBolao.toUpperCase()} — ${nomeEdicaoFormatado.toUpperCase()}* 🍀\n`;
    msg += `📊 *Boletim de Apuração — ${dataHora}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (concursos.length === 0) {
      msg += `📌 *Edição Iniciando:* Concurso ${cicloAtual.concursoInicial || '3058'}\n`;
      msg += `⏳ *Status:* Aguardando primeiro sorteio oficial!\n\n`;
    } else {
      const primeiro = concursos[0].numero;
      const ultimo = concursos[concursos.length - 1].numero;
      msg += `🎯 *Edição Atual:* Concursos ${primeiro} a ${ultimo} (${concursos.length} sorteios acumulados)\n\n`;

      msg += `🎲 *DEZENAS SORTEADAS NESTA EDIÇÃO:*\n`;
      concursos.forEach((c, idx) => {
        const dezenasStr = c.dezenas.join(' - ');
        msg += `• *${idx + 1}º Sorteio (Conc. ${c.numero})*: [ ${dezenasStr} ]\n`;
      });
      msg += `\n`;
    }

    // Regra da Quadra no 1º sorteio
    if (ganhadoresQuadraPrimeiroSorteio && ganhadoresQuadraPrimeiroSorteio.length > 0) {
      msg += `✨ *GANHADOR(ES) DA QUADRA NO 1º SORTEIO:*\n`;
      ganhadoresQuadraPrimeiroSorteio.forEach(g => {
        msg += `🎉 *${g.nome}* acertou ${g.acertosNoPrimeiroSorteio} dezenas na abertura da edição!\n`;
      });
      if (financeiro.valorPagoQuadra > 0) {
        msg += `💵 *Valor Pago da Quadra:* R$ ${financeiro.valorPagoQuadra.toFixed(2).replace('.', ',')}\n`;
      }
      msg += `\n`;
    }

    // Ganhador da Sena
    if (ganhadoresSena && ganhadoresSena.length > 0) {
      msg += `🏆 *GRANDE CAMPEÃO DO BOLÃO (6 ACERTOS ACUMULADOS):*\n`;
      ganhadoresSena.forEach(g => {
        msg += `👑 *${g.nome}* fechou a cartela com 6 números! PARABÉNS! 🍾\n`;
      });
      msg += `\n`;
    }

    // Ranking de Líderes
    msg += `🏅 *RANKING DE PONTUAÇÃO (TOP APOSTAS):*\n`;
    const ordenadas = [...apostas].sort((a, b) => b.totalAcertos - a.totalAcertos);
    const topApostas = ordenadas.slice(0, 10);

    if (topApostas.length === 0) {
      msg += `(Nenhuma aposta cadastrada)\n`;
    } else {
      topApostas.forEach((a, idx) => {
        const pos = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;
        const estrelas = '⭐'.repeat(Math.min(a.totalAcertos, 6));
        msg += `${pos} *${a.nome}*: ${a.totalAcertos}/6 acertos ${estrelas}\n`;
      });
    }

    // Resumo financeiro enxuto para grupos (sem Arrecadação Bruta, sem Taxa do Organizador e sem Pagas/Pendentes)
    msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    const labelAmigos = financeiro.totalApostadores === 1 ? 'amigo' : 'amigos';
    const labelApostas = financeiro.totalApostas === 1 ? 'aposta' : 'apostas';
    msg += `👥 *Total de Apostas:* ${financeiro.totalApostas} ${labelApostas} (${financeiro.totalApostadores} ${labelAmigos})\n`;
    msg += `💰 *Valor da Cota:* R$ ${financeiro.valorCota.toFixed(2).replace('.', ',')}\n`;
    msg += `💰 *Total Líquido do Bolão:* R$ ${financeiro.totalLiquidoGeralArrecadado.toFixed(2).replace('.', ',')}\n`;
    
    if (financeiro.valorPagoQuadra > 0) {
      msg += `🎯 *Prêmio da Quadra (1º Sorteio):* R$ ${financeiro.valorPagoQuadra.toFixed(2).replace('.', ',')}\n`;
      msg += `🏆 *Prêmio da Sena (Líquido Restante):* R$ ${financeiro.premioSenaLiquido.toFixed(2).replace('.', ',')}\n`;
    } else if (financeiro.premioQuadraConfig > 0) {
      const label = financeiro.premioQuadraDinamico ? '🎯 *Reserva da Quadra (10% do Líquido):*' : '🎯 *Reserva da Quadra (1º Sorteio):*';
      msg += `${label} R$ ${financeiro.premioQuadraConfig.toFixed(2).replace('.', ',')} *(Deduzido se houver acertador)*\n`;
      msg += `🏆 *Prêmio da Sena:* R$ ${financeiro.premioSenaLiquido.toFixed(2).replace('.', ',')}\n`;
    } else {
      msg += `🏆 *Prêmio da Sena:* R$ ${financeiro.premioSenaLiquido.toFixed(2).replace('.', ',')}\n`;
    }
    msg += `\n`;
    msg += `📲 *Acompanhe as cartelas atualizadas no SenaClube!* Boa sorte a todos! 🍀`;

    return msg;
  },



  /**
   * Modelo Padrão de Abertura de Novo Bolão
   */
  gerarMensagemAberturaPadrao(params = {}) {
    const nomeBolao = params.nomeBolao || 'Bolão entre Amigos';
    const cicloNome = (params.cicloNome || 'Nova Edição').replace(/Ciclo\s*/i, 'Edição ');
    const concursoInicial = params.concursoInicial || '3061';
    const dataInicio = params.dataInicio || 'Terça-feira';
    const dataEncerramento = params.dataEncerramento || 'Domingo às 20h';
    const valorCota = params.valorCota ? `R$ ${Number(params.valorCota).toFixed(2).replace('.', ',')}` : 'R$ 30,00';
    const chavePix = params.chavePix || '';
    
    let infoQuadra = '';
    if (params.premioQuadra && Number(params.premioQuadra) > 0) {
      infoQuadra = `R$ ${Number(params.premioQuadra).toFixed(2).replace('.', ',')}`;
    } else if (params.premioQuadraDinamico) {
      infoQuadra = '10% do valor líquido arrecadado';
    }

    let msg = `🍀 *ATENÇÃO PESSOAL — INSCRIÇÕES ABERTAS!* 🍀\n`;
    msg += `🏆 *${nomeBolao.toUpperCase()} — ${cicloNome.toUpperCase()}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `Fala, amigos! Está oficialmente aberto o período de apostas e renovações para a nossa próxima edição do bolão da Mega-Sena!\n\n`;
    msg += `📌 *Concurso Inicial:* ${concursoInicial}\n`;
    msg += `🗓️ *Primeiro Sorteio:* ${dataInicio}\n`;
    msg += `⏰ *Prazo Limite para Apostas:* ${dataEncerramento}\n`;
    msg += `💰 *Valor por Jogo/Cota:* ${valorCota}\n`;
    
    if (infoQuadra) {
      msg += `🎯 *Prêmio Especial da Quadra (1º Sorteio):* ${infoQuadra}\n`;
    }
    
    if (chavePix) {
      msg += `🔑 *Chave Pix:* ${chavePix}\n`;
    }
    
    msg += `\n📝 *COMO PARTICIPAR:*\n`;
    msg += `1️⃣ Envie suas 6 dezenas no privado para mim, ou confirme que mantém seu jogo anterior.\n`;
    msg += `2️⃣ Realize o Pix da sua cota e envie o comprovante.\n`;
    msg += `3️⃣ Após o prazo, o sistema travará as apostas e nenhum jogo poderá ser alterado!\n\n`;
    msg += `Boa sorte a todos, vamos buscar essa Sena juntos! 💰🚀`;
    return msg;
  },

  /**
   * Modelo de Lembrete / Contagem Regressiva de Fechamento de Apostas
   */
  gerarMensagemLembreteFechamento(params = {}) {
    const nomeBolao = params.nomeBolao || 'Bolão entre Amigos';
    const dataEncerramento = params.dataEncerramento || 'HOJE às 20h';
    const chavePix = params.chavePix || '';

    let msg = `🚨 *ÚLTIMO AVISO — AS APOSTAS VÃO FECHAR!* ⏰\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Amigos do *${nomeBolao}*, estamos nos momentos finais para encerramento das inscrições!\n\n`;
    msg += `⏳ *Prazo Final Impreterível:* ${dataEncerramento}\n\n`;
    msg += `⚠️ *Atenção à Regra de Ouro:*\n`;
    msg += `Assim que as apostas forem finalizadas no sistema, elas serão *travadas de forma permanente* — nenhuma aposta poderá ser incluída ou alterada!\n\n`;
    
    if (chavePix) {
      msg += `🔑 *Chave Pix:* ${chavePix}\n\n`;
    }

    msg += `Quem não confirmou ou não enviou o comprovante, corre que ainda dá tempo! 🏃‍♂️💨🍀`;
    return msg;
  },

  /**
   * Convite Completo e Explicativo para Novos Apostadores
   */
  gerarMensagemConviteCompleto(params = {}) {
    const nomeBolao = params.nomeBolao || 'SenaClube';
    const valorCota = params.valorCota ? `R$ ${Number(params.valorCota).toFixed(2).replace('.', ',')}` : 'R$ 30,00';
    const whatsapp = params.whatsapp || '(61) 99627-2630';
    const whatsappLink = params.whatsappLink || 'https://wa.me/5561996272630';
    const linkApp = params.linkApp || 'https://sena-clube.vercel.app';
    const linkGrupoWhatsApp = params.linkGrupoWhatsApp || 'https://chat.whatsapp.com/KT4gbhyKUUrBqW9fU2ZGpv';

    let msg = `🍀 *VOCÊ FOI CONVIDADO PARA O NOSSO BOLÃO ENTRE AMIGOS!* 🏆💰\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `E aí, tudo bem? Quero te fazer um convite especial para participar do nosso bolão entre amigos: o *${nomeBolao}*!\n\n`;
    msg += `Se você nunca participou, fica tranquilo que a dinâmica é simples, muito divertida e com chances reais de vitória! Veja como funciona:\n\n`;
    msg += `🎯 *COMO FUNCIONA O JOGO:*\n`;
    msg += `1️⃣ *Você escolhe 6 dezenas* da sua sorte (de 01 a 60).\n`;
    msg += `2️⃣ *Sua aposta vale por uma EDIÇÃO INTEIRA* de sorteios — ou seja, você não joga para apenas um dia, seu jogo continua ativo e acumulando acertos a cada sorteio da Mega-Sena da Caixa até termos um vencedor!\n`;
    msg += `3️⃣ *Valor da cota:* Apenas ${valorCota} por edição! (Você pode ter mais de uma cota se quiser).\n\n`;
    msg += `🏆 *AS FORMAS DE GANHAR:*\n`;
    msg += `💰 *Prêmio Máximo da Sena:* Quem cravar os 6 acertos ao longo da edição leva a bolada principal do bolão!\n`;
    msg += `⚡ *Prêmio Bônus da Quadra:* Logo no 1º sorteio da edição, se alguém acertar a quadra (4 números), já fatura na hora um prêmio bônus de incentivo!\n\n`;
    msg += `📱 *TRANSPARÊNCIA TOTAL EM TEMPO REAL:*\n`;
    msg += `Nosso bolão conta com um painel online exclusivo! Você acompanha o ranking de acertos, a apuração automática direto da Caixa e o placar em tempo real:\n`;
    msg += `👉 ${linkApp}\n\n`;
    msg += `🔒 *REGRA DE OURO DA CONFIANÇA:*\n`;
    msg += `Assim que o prazo de inscrições encerra, o sistema trava todas as apostas de forma permanente. Ninguém altera e ninguém inclui jogos de última hora — 100% de transparência e segurança para todos!\n\n`;
    msg += `⚠️ *AVISO IMPORTANTE (TRANSPARÊNCIA TOTAL):*\n`;
    msg += `Este é um *bolão particular e recreativo entre amigos*. Ele *NÃO é uma aposta oficial registrada na Caixa Econômica Federal*. Utilizamos exclusivamente as dezenas dos sorteios oficiais da Mega-Sena como base pública e imparcial para nossa apuração interna e premiações do grupo.\n\n`;
    msg += `👥 *ENTRE NO NOSSO GRUPO DO WHATSAPP:*\n`;
    msg += `Acompanhe todos os avisos, sorteios e a resenha dos participantes direto no grupo:\n`;
    msg += `👉 ${linkGrupoWhatsApp}\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🚀 *QUER GARANTIR SUA VAGA NA PRÓXIMA EDIÇÃO?*\n\n`;
    msg += `Basta enviar suas 6 dezenas e o comprovante no meu WhatsApp:\n`;
    msg += `📲 *${whatsapp}*\n`;
    msg += `👉 Ou clique direto para falar comigo: ${whatsappLink}\n\n`;
    msg += `Bora torcer juntos e buscar essa bolada! Me dá um alô aqui se for entrar! 🏃‍♂️💨🍀`;
    return msg;
  },

  /**
   * Convite Rápido e Direto para Novos Apostadores
   */
  gerarMensagemConviteRapido(params = {}) {
    const nomeBolao = params.nomeBolao || 'Bolão entre Amigos';
    const valorCota = params.valorCota ? `R$ ${Number(params.valorCota).toFixed(2).replace('.', ',')}` : 'R$ 30,00';
    const whatsapp = params.whatsapp || '(61) 99627-2630';
    const whatsappLink = params.whatsappLink || 'https://wa.me/5561996272630';
    const linkApp = params.linkApp || 'https://sena-clube.vercel.app';
    const linkGrupoWhatsApp = params.linkGrupoWhatsApp || 'https://chat.whatsapp.com/KT4gbhyKUUrBqW9fU2ZGpv';

    let msg = `Fala, amigo! Beleza? 🚀\n\n`;
    msg += `Estamos abrindo as vagas para a nova edição do nosso *${nomeBolao}* e lembrei de você! 🍀\n\n`;
    msg += `É bem diferente de uma aposta comum:\n`;
    msg += `✅ Você escolhe *6 números* e eles valem para *vários sorteios seguidos* até sair um vencedor!\n`;
    msg += `✅ Tem o prêmio principal da *Sena* e prêmio rápido de *Quadra* logo no primeiro sorteio!\n`;
    msg += `✅ Temos um sistema online onde todo mundo acompanha os acertos e o ranking ao vivo: ${linkApp}\n`;
    msg += `✅ Cota super acessível: apenas *${valorCota}*.\n\n`;
    msg += `⚠️ *Aviso importante:* Este é um bolão privado entre amigos, *não é aposta oficial da lotérica*. Os sorteios da Caixa são usados apenas como base para apuração do nosso grupo.\n\n`;
    msg += `👥 *Entre no nosso grupo do WhatsApp:* ${linkGrupoWhatsApp}\n\n`;
    msg += `Bora entrar nessa com a gente e torcer junto?\n\n`;
    msg += `Para garantir sua vaga, só me mandar suas 6 dezenas no WhatsApp:\n`;
    msg += `📲 *${whatsapp}* (${whatsappLink})\n\n`;
    msg += `Bora pra cima! 💰🎱`;
    return msg;
  },

  async copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
    const textArea = document.createElement('textarea');
    textArea.value = texto;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  },

  /**
   * Gera o HTML completo, estilizável e pronto para impressão/PDF de alta fidelidade
   * Suporta o formato compacto em 4 colunas (estilo planilha original) e o boletim de 1 página.
   */
  gerarHtmlRelatorioPDF(dadosBolao, apuracao, financeiro, cicloAtual, tipo = 'compacta', apenasConfirmadas = false, ordenacao = 'alfabetica') {
    const nomeBolao = dadosBolao.nomeBolao || 'SENACLUBE';
    const dataHora = new Date().toLocaleString('pt-BR');
    const { concursos } = cicloAtual;
    const { apostas, ganhadoresSena, ganhadoresQuadraPrimeiroSorteio } = apuracao;

    let apostasFiltradas = [...apostas];
    if (apenasConfirmadas) {
      apostasFiltradas = apostasFiltradas.filter(a => a.pago || a.confirmada);
    }

    // Ordenação
    if (ordenacao === 'alfabetica') {
      apostasFiltradas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    } else {
      apostasFiltradas.sort((a, b) => b.totalAcertos - a.totalAcertos || a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    let subtituloTipo = 'Planilha Geral de Apostas';
    if (tipo === 'lideres') {
      subtituloTipo = 'Ranking de Líderes (4+ Acertos)';
      apostasFiltradas = apostasFiltradas.filter(a => a.totalAcertos >= 4);
    } else if (tipo === 'boletim') {
      subtituloTipo = 'Boletim Executivo (Top 40 Líderes)';
      // No boletim sintético de 1 página, foca nos maiores pontuadores
      apostasFiltradas.sort((a, b) => b.totalAcertos - a.totalAcertos || a.nome.localeCompare(b.nome, 'pt-BR'));
      apostasFiltradas = apostasFiltradas.slice(0, 40);
    } else {
      subtituloTipo = `Planilha de Apostas (${apostasFiltradas.length} jogos em 4 colunas)`;
    }

    // Cores de alta legibilidade para cada concurso
    const coresConcursos = [
      { bg: '#fef08a', text: '#713f12', border: '#eab308' }, // Amarelo
      { bg: '#bbf7d0', text: '#14532d', border: '#22c55e' }, // Verde
      { bg: '#bae6fd', text: '#0c4a6e', border: '#0ea5e9' }, // Azul
      { bg: '#fed7aa', text: '#7c2d12', border: '#f97316' }, // Laranja
      { bg: '#fecdd3', text: '#881337', border: '#f43f5e' }, // Rosa
      { bg: '#e9d5ff', text: '#581c87', border: '#a855f7' }, // Roxo
      { bg: '#ccfbf1', text: '#134e4a', border: '#14b8a6' }, // Ciano
      { bg: '#d9f99d', text: '#365314', border: '#84cc16' }  // Lima
    ];

    // Mapa de dezenas sorteadas para conferência ultra rápida O(1)
    const mapaDezenasSorteadas = new Map();
    concursos.forEach((c, cIdx) => {
      (c.dezenas || []).forEach(d => {
        const pad = String(d).padStart(2, '0');
        mapaDezenasSorteadas.set(pad, {
          concursoNumero: c.numero,
          concursoIndex: cIdx,
          cor: coresConcursos[cIdx % coresConcursos.length]
        });
      });
    });

    // Sorteios em linha compacta
    let sorteiosHtml = '';
    if (concursos.length === 0) {
      sorteiosHtml = `<span style="color:#64748b;">Aguardando primeiro sorteio oficial (Inicial: ${cicloAtual.concursoInicial || 3058})</span>`;
    } else {
      sorteiosHtml = concursos.map((c, idx) => {
        const cor = coresConcursos[idx % coresConcursos.length];
        const dezenasStr = (c.dezenas || []).map(d => `<span class="mini-dez" style="background:${cor.bg}; color:${cor.text}; border:1px solid ${cor.border};">${d}</span>`).join('');
        return `<div class="chip-sorteio"><strong>${idx + 1}º (Conc. ${c.numero}):</strong> ${dezenasStr}</div>`;
      }).join('');
    }

    // Banner de Campeão / Quadra (faixa fina e elegante)
    let bannerGanhadorHtml = '';
    if (ganhadoresSena && ganhadoresSena.length > 0) {
      const nomes = ganhadoresSena.map(g => g.nome).join(', ');
      bannerGanhadorHtml += `
        <div class="banner-sena-slim">
          🏆 <strong>GRANDE CAMPEÃO DA SENA:</strong> ${nomes} completou os 6 números acumulados! PARABÉNS!
        </div>
      `;
    }

    if (ganhadoresQuadraPrimeiroSorteio && ganhadoresQuadraPrimeiroSorteio.length > 0) {
      const nomesQ = ganhadoresQuadraPrimeiroSorteio.map(g => g.nome).join(', ');
      const valQ = financeiro.valorPagoQuadra > 0 ? ` (Prêmio Pago: R$ ${financeiro.valorPagoQuadra.toFixed(2).replace('.', ',')})` : '';
      bannerGanhadorHtml += `
        <div class="banner-quadra-slim">
          🎯 <strong>QUADRA NO 1º SORTEIO:</strong> ${nomesQ}${valQ}
        </div>
      `;
    }

    // Itens das apostas compactas
    const rowsCompactas = apostasFiltradas.map((a, idx) => {
      const isLider = a.totalAcertos >= 4;
      const isCampeao = a.totalAcertos >= 6;

      const numsHtml = (a.dezenas || []).map(numStr => {
        const numPad = String(numStr).padStart(2, '0');
        const hit = mapaDezenasSorteadas.get(numPad);
        if (hit) {
          return `<span class="n hit" style="background-color:${hit.cor.bg}; color:${hit.cor.text}; border-color:${hit.cor.border};">${numPad}</span>`;
        }
        return `<span class="n">${numPad}</span>`;
      }).join('');

      let scoreClass = 'score-zero';
      if (isCampeao) scoreClass = 'score-campeao';
      else if (isLider) scoreClass = 'score-lider';
      else if (a.totalAcertos > 0) scoreClass = 'score-hit';

      return `
        <div class="bet-row-compact ${isCampeao ? 'row-campeao' : isLider ? 'row-lider' : ''}">
          <span class="bet-name" title="${a.nome}">${a.nome}</span>
          <div class="bet-nums-wrap">${numsHtml}</div>
          <span class="bet-score ${scoreClass}">${a.totalAcertos}</span>
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeBolao} - ${subtituloTipo}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 6mm 6mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    body {
      background: #f1f5f9;
      color: #0f172a;
      font-size: 8px;
      line-height: 1.15;
    }
    .no-print {
      background: #090d16;
      color: #ffffff;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 999;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      font-size: 12px;
    }
    .no-print-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .no-print-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-action-print {
      background: #00c06d;
      color: #ffffff;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(0, 192, 109, 0.4);
    }
    .btn-action-print:hover {
      background: #00db7c;
    }
    .btn-action-close {
      background: #334155;
      color: #e2e8f0;
      border: none;
      padding: 7px 12px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-action-close:hover {
      background: #475569;
    }

    @media print {
      .no-print {
        display: none !important;
      }
      body {
        background: #ffffff;
      }
      .page-container {
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        max-width: 100% !important;
        width: 100% !important;
      }
    }

    .page-container {
      max-width: 960px;
      margin: 10px auto;
      background: #ffffff;
      padding: 12px 14px;
      border-radius: 6px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }

    /* Cabeçalho Compacto */
    .compact-header {
      border-bottom: 1.5px solid #00c06d;
      padding-bottom: 5px;
      margin-bottom: 6px;
    }
    .row-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    .title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .logo-ico {
      font-size: 14px;
    }
    .title-main {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .sub-badge {
      background: #f1f5f9;
      color: #059669;
      border: 1px solid #10b981;
      font-size: 8px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .meta-wrap {
      font-size: 8px;
      color: #475569;
      display: flex;
      gap: 10px;
    }

    /* Sorteios Compactos */
    .row-sorteios {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      padding: 2px 6px;
      margin-bottom: 3px;
      font-size: 7.5px;
    }
    .tag-label {
      font-weight: 800;
      color: #334155;
    }
    .chip-sorteio {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      padding: 1px 4px;
    }
    .mini-dez {
      display: inline-block;
      width: 14px;
      text-align: center;
      font-weight: 800;
      border-radius: 2px;
      font-size: 7.5px;
      margin: 0 1px;
    }

    /* Linha Financeira */
    .row-financeiro {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f1f5f9;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 7.5px;
      color: #334155;
    }
    .highlight-fin {
      color: #059669;
      font-weight: 800;
    }
    .quadra-fin {
      color: #b45309;
      font-weight: 700;
    }

    /* Banners finos */
    .banner-sena-slim {
      background: #fef08a;
      border: 1px solid #eab308;
      color: #854d0e;
      padding: 2px 6px;
      border-radius: 3px;
      margin-top: 3px;
      font-size: 8px;
      font-weight: 600;
    }
    .banner-quadra-slim {
      background: #ecfdf5;
      border: 1px solid #10b981;
      color: #065f46;
      padding: 2px 6px;
      border-radius: 3px;
      margin-top: 3px;
      font-size: 8px;
    }

    /* Barra de cabeçalho das 4 colunas */
    .col-headers-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 3px;
      background: #0f172a;
      color: #f8fafc;
      padding: 2px 4px;
      border-radius: 2px;
      font-size: 7px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .col-header-cell {
      display: flex;
      justify-content: space-between;
      padding: 0 2px;
    }

    /* Grade de 4 Colunas Contínuas (Estilo Original do PDF) */
    .grid-4-colunas {
      column-count: 4;
      column-gap: 8px;
      column-rule: 1px solid #e2e8f0;
    }

    .bet-row-compact {
      break-inside: avoid;
      page-break-inside: avoid;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 12px;
      line-height: 12px;
      padding: 0 1px;
      border-bottom: 0.5px solid #e2e8f0;
      font-size: 7.5px;
    }
    .bet-row-compact:hover {
      background-color: #f8fafc;
    }
    .bet-name {
      width: 44%;
      max-width: 44%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
      color: #1e293b;
      padding-right: 2px;
    }
    .bet-nums-wrap {
      display: flex;
      gap: 1.5px;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 7px;
      width: 46%;
      justify-content: flex-end;
    }
    .n {
      display: inline-block;
      width: 12px;
      text-align: center;
      border-radius: 1.5px;
      color: #475569;
    }
    .n.hit {
      font-weight: 800;
      box-shadow: 0 0 0 0.5px rgba(0,0,0,0.15);
    }
    .bet-score {
      width: 10%;
      text-align: right;
      font-size: 7px;
      font-weight: 700;
      padding-right: 1px;
    }
    .score-zero {
      color: #94a3b8;
    }
    .score-hit {
      color: #0284c7;
      font-weight: 800;
    }
    .score-lider {
      color: #15803d;
      font-weight: 800;
    }
    .score-campeao {
      color: #b45309;
      font-weight: 800;
    }
    .row-campeao {
      background-color: #fef9c3 !important;
    }
    .row-lider {
      background-color: #f0fdf4;
    }

    /* Rodapé */
    .doc-footer-slim {
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 7px;
    }
  </style>
</head>
<body>

  <!-- Barra Superior de Impressão -->
  <div class="no-print">
    <div class="no-print-left">
      <span style="font-size: 16px;">📄</span>
      <div>
        <strong>Visualização Compacta em 4 Colunas (Estilo Original)</strong>
        <span style="color:#94a3b8; margin-left: 8px;">Dica: Selecione "Salvar como PDF" e marque "Gráficos de segundo plano".</span>
      </div>
    </div>
    <div class="no-print-actions">
      <button class="btn-action-close" onclick="window.close()">✖️ Fechar</button>
      <button class="btn-action-print" onclick="window.print()">🖨️ Salvar como PDF / Imprimir</button>
    </div>
  </div>

  <div class="page-container">
    <!-- Cabeçalho Ultra Enxuto -->
    <header class="compact-header">
      <div class="row-top">
        <div class="title-wrap">
          <span class="logo-ico">🍀</span>
          <strong class="title-main">${nomeBolao}</strong>
          <span class="sub-badge">${subtituloTipo}</span>
        </div>
        <div class="meta-wrap">
          <span><strong>Edição:</strong> ${(cicloAtual.nome || 'Edição 1').replace(/Ciclo\s*/i, 'Edição ')} (Conc. ${concursos.length > 0 ? concursos[0].numero : cicloAtual.concursoInicial} a ${concursos.length > 0 ? concursos[concursos.length - 1].numero : '...'})</span>
          <span><strong>Emissão:</strong> ${dataHora}</span>
          <span>${cicloAtual.status === 'finalizado' ? '🏆 Encerrada' : '⏳ Em Andamento'}</span>
        </div>
      </div>

      <!-- Sorteios Realizados -->
      <div class="row-sorteios">
        <span class="tag-label">🎲 SORTEIOS (${concursos.length}):</span>
        ${sorteiosHtml}
      </div>

      <!-- Resumo Financeiro Oficial -->
      <div class="row-financeiro">
        <span>👥 <strong>Apostas:</strong> ${financeiro.totalApostas} (${financeiro.pagas} pagas)</span>
        <span>💵 <strong>Arrecadação:</strong> R$ ${financeiro.totalArrecadadoBruto.toFixed(2).replace('.', ',')}</span>
        <span>💼 <strong>Taxa 20%:</strong> R$ ${financeiro.valorOrganizadorArrecadado.toFixed(2).replace('.', ',')}</span>
        <span class="highlight-fin">🏆 <strong>Prêmio Sena:</strong> R$ ${financeiro.premioSenaLiquido.toFixed(2).replace('.', ',')}</span>
        ${financeiro.valorPagoQuadra > 0 ? `<span class="quadra-fin">🎯 <strong>Quadra Paga:</strong> R$ ${financeiro.valorPagoQuadra.toFixed(2).replace('.', ',')}</span>` : ''}
      </div>

      ${bannerGanhadorHtml}
    </header>

    <!-- Barra de Títulos das 4 Colunas -->
    <div class="col-headers-bar">
      <div class="col-header-cell"><span>Apostador</span><span>Dezenas (Ac)</span></div>
      <div class="col-header-cell"><span>Apostador</span><span>Dezenas (Ac)</span></div>
      <div class="col-header-cell"><span>Apostador</span><span>Dezenas (Ac)</span></div>
      <div class="col-header-cell"><span>Apostador</span><span>Dezenas (Ac)</span></div>
    </div>

    <!-- Grade em 4 Colunas Contínuas -->
    <div class="grid-4-colunas">
      ${rowsCompactas || '<div style="padding:10px; color:#64748b;">Nenhuma aposta cadastrada.</div>'}
    </div>

    <!-- Rodapé Discreto -->
    <footer class="doc-footer-slim">
      <span><strong>SenaClube</strong> — Sistema de Gestão de Bolões | Layout de Alta Densidade</span>
      <span>Baseado nas regras da Mega-Sena | Emitido em ${dataHora}</span>
    </footer>
  </div>

</body>
</html>`;
  },

  /**
   * Abre a janela de visualização e disparo do PDF
   */
  abrirJanelaPDF(dadosBolao, apuracao, financeiro, cicloAtual, tipo = 'compacta', apenasConfirmadas = false, ordenacao = 'alfabetica') {
    const html = this.gerarHtmlRelatorioPDF(dadosBolao, apuracao, financeiro, cicloAtual, tipo, apenasConfirmadas, ordenacao);
    const win = window.open('', '_blank');
    if (!win) {
      alert('⚠️ Por favor, permita a abertura de pop-ups neste navegador para visualizar e salvar o PDF!');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }
};

window.ExportShare = ExportShare;

