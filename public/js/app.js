/**
 * SenaClube — Orquestrador da Aplicação (App.js v2.4)
 * Suporte nativo a 4.949+ apostas, cálculo da taxa do organizador (20%),
 * campo de prêmio da Quadra com dedução automática do prêmio total da Sena
 * e exibição detalhada no quadro de Prêmio Líquido.
 */

// Prevenção rigorosa de XSS (Cross-Site Scripting)
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Estado Global
const state = {
  nomeBolao: 'Bolão dos amigos',
  taxaOrganizadorGlobal: 0.20,
  cicloVisualizadoId: 1,
  ciclos: [],
  chavePix: '828.851.921-00',
  celularOrganizador: '(61) 99627-2630',
  linkGrupoWhatsApp: 'https://chat.whatsapp.com/KT4gbhyKUUrBqW9fU2ZGpv',
  urlSiteAcesso: 'https://sena-clube.vercel.app',
  textosWhatsAppCustomizados: {},
  abaMensagemWhatsAppAtiva: 'boletim',
  filtroAtual: 'todos',
  buscaTexto: '',
  paginaAtual: 1,
  itensPorPagina: 50,
  isAdmin: false,
  version: 1,
  filtroConcursoAteIndex: null
};

try {
  const localTxt = localStorage.getItem('senaclube_textos_whatsapp');
  if (localTxt) {
    const parsed = JSON.parse(localTxt);
    if (parsed && typeof parsed === 'object') {
      state.textosWhatsAppCustomizados = parsed;
    }
  }
} catch (e) {}

// Helpers de Ciclo
function getCicloVisualizado() {
  if (!state.ciclos || state.ciclos.length === 0) {
    const defaultCiclo = {
      id: 1,
      nome: 'Edição 1',
      status: 'ativo',
      concursoInicial: 3064,
      concursoFinal: null,
      valorCota: 30.0,
      taxaOrganizador: state.taxaOrganizadorGlobal || 0.20,
      premioQuadra: 0.0,
      concursos: [],
      apostas: [],
      apostasDescartadas: [],
      faseApostas: 'aberta',
      alertasExibidos: { quadraCicloId: null, senaCicloId: null },
      ganhadorSenaNome: null,
      ganhadorQuadraNome: null,
      criadoEm: new Date().toISOString(),
      finalizadoEm: null
    };
    state.ciclos = [defaultCiclo];
    state.cicloVisualizadoId = 1;
    return defaultCiclo;
  }
  return state.ciclos.find(c => c.id === state.cicloVisualizadoId) || state.ciclos[state.ciclos.length - 1];
}

function getCicloAnterior() {
  const atual = getCicloVisualizado();
  const idx = state.ciclos.findIndex(c => c.id === atual.id);
  if (idx > 0) return state.ciclos[idx - 1];
  return null;
}

// ==========================================================================
// Inicialização
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa o modo administrador exclusivamente via token assinado de sessão
  const adminToken = sessionStorage.getItem('senaclube_admin_token') || localStorage.getItem('senaclube_admin_token');
  state.isAdmin = !!adminToken;

  if (state.isAdmin) {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }

  setupEventListeners();
  await carregarEstado();
  sincronizarUltimoCaixaHeader();
  renderApp();
});

// ==========================================================================
// Persistência
// ==========================================================================
async function salvarEstado() {
  mostrarIndicadorSalvamento(false, true);

  // Garante que o ciclo ativo sempre existe no array global
  getCicloVisualizado();

  const token = sessionStorage.getItem('senaclube_admin_token') || localStorage.getItem('senaclube_admin_token');

  const payload = {
    nomeBolao: state.nomeBolao,
    taxaOrganizadorGlobal: state.taxaOrganizadorGlobal,
    cicloVisualizadoId: state.cicloVisualizadoId,
    ciclos: state.ciclos,
    chavePix: state.chavePix || '(61) 99627-2630',
    celularOrganizador: state.celularOrganizador || '(61) 99627-2630',
    linkGrupoWhatsApp: state.linkGrupoWhatsApp || 'https://chat.whatsapp.com/KT4gbhyKUUrBqW9fU2ZGpv',
    urlSiteAcesso: state.urlSiteAcesso || 'https://sena-clube.vercel.app',
    textosWhatsAppCustomizados: state.textosWhatsAppCustomizados || {},
    version: state.version || 1
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/bolao', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const resData = await res.json().catch(() => ({}));

    // Se o backend recusou por falta de autenticação
    if (res.status === 401) {
      state.isAdmin = false;
      sessionStorage.removeItem('senaclube_admin_token');
      localStorage.removeItem('senaclube_admin_token');
      document.body.classList.remove('is-admin');
      mostrarIndicadorSalvamento(false);
      mostrarNotificacaoToast('🔒 Sessão de Administrador expirada. Faça login novamente.');
      abrirModal('modal-login-admin');
      renderApp();
      return false;
    }

    // Se houve conflito de concorrência com outro dispositivo
    if (res.status === 409) {
      if (resData.serverVersion && resData.serverVersion >= state.version) {
        state.version = resData.serverVersion;
        const retryRes = await fetch('/api/bolao', {
          method: 'POST',
          headers: { ...headers, 'X-Force-Save': 'true' },
          body: JSON.stringify({ ...payload, version: state.version, forceSave: true })
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json().catch(() => ({}));
          if (typeof retryData.version === 'number') state.version = retryData.version;
          mostrarIndicadorSalvamento(true);
          return true;
        }
      }
      mostrarIndicadorSalvamento(false);
      mostrarNotificacaoToast('⚠️ Conflito de Concorrência: recarregue a página para obter a versão mais recente.');
      return false;
    }

    if (!res.ok) {
      throw new Error(resData.error || `HTTP ${res.status}`);
    }

    if (typeof resData.version === 'number') {
      state.version = resData.version;
    }

    mostrarIndicadorSalvamento(true);
    return true;
  } catch (err) {
    console.warn('[SenaClube] Erro ao salvar backend:', err.message);
    mostrarIndicadorSalvamento(false);
    return false;
  }
}

async function carregarEstado() {
  try {
    const res = await fetch(`/api/bolao?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        if (typeof data.version === 'number') state.version = data.version;
        if (data.nomeBolao) {
          state.nomeBolao = String(data.nomeBolao).replace(/\bWM\b/gi, '').replace(/\s{2,}/g, ' ').trim() || 'Bolão dos amigos';
        }
        if (typeof data.taxaOrganizadorGlobal === 'number') state.taxaOrganizadorGlobal = data.taxaOrganizadorGlobal;
        if (data.chavePix) state.chavePix = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarChavePix(data.chavePix) : data.chavePix;
        if (data.celularOrganizador) state.celularOrganizador = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarTelefone(data.celularOrganizador) : data.celularOrganizador;
        if (data.linkGrupoWhatsApp) state.linkGrupoWhatsApp = data.linkGrupoWhatsApp;
        if (data.urlSiteAcesso) state.urlSiteAcesso = data.urlSiteAcesso;
        if (data.textosWhatsAppCustomizados && typeof data.textosWhatsAppCustomizados === 'object') {
          state.textosWhatsAppCustomizados = Object.assign({}, state.textosWhatsAppCustomizados, data.textosWhatsAppCustomizados);
        }
        if (state.textosWhatsAppCustomizados && typeof state.textosWhatsAppCustomizados === 'object') {
          Object.keys(state.textosWhatsAppCustomizados).forEach(k => {
            if (typeof state.textosWhatsAppCustomizados[k] === 'string') {
              let t = state.textosWhatsAppCustomizados[k];
              // Desembola itens colados e normaliza parâmetros
              t = aplicarParametrosDinamicosNoTexto(t, {
                nomeBolao: state.nomeBolao,
                chavePix: state.chavePix
              });
              state.textosWhatsAppCustomizados[k] = t;
            }
          });
          try {
            localStorage.setItem('senaclube_textos_whatsapp', JSON.stringify(state.textosWhatsAppCustomizados));
          } catch (e) {}
        }
        if (data.ciclos && Array.isArray(data.ciclos) && data.ciclos.length > 0) {
          state.ciclos = data.ciclos.map(c => {
            if (c.nome && /^ciclo\s*\d+/i.test(c.nome)) {
              c.nome = c.nome.replace(/^ciclo/i, 'Edição');
            }
            if (!Array.isArray(c.apostas)) c.apostas = [];
            if (!Array.isArray(c.concursos)) c.concursos = [];
            return c;
          });
          state.cicloVisualizadoId = data.cicloVisualizadoId || state.ciclos[0].id;
        }
      }
    }
  } catch (e) {
    console.warn('[SenaClube] Aviso ao carregar dados do servidor:', e.message);
  }

  // Garante que o estado sempre tenha pelo menos uma edição ativa conectada
  getCicloVisualizado();
  mostrarIndicadorSalvamento(true);
  atualizarTituloAbaNavegador();
}

function atualizarTituloAbaNavegador() {
  const nome = (state.nomeBolao || '').trim();
  document.title = nome ? `SenaClube - ${nome}` : 'SenaClube';
  atualizarHeaderNomeBolao();
}

function atualizarHeaderNomeBolao() {
  const nome = (state.nomeBolao || '').trim();
  const el = document.getElementById('header-nome-bolao');
  const container = document.getElementById('header-bolao-nome-container');
  if (el) {
    el.textContent = nome || 'Bolão Oficial';
  }
  if (container) {
    container.style.display = nome ? 'inline-flex' : 'none';
  }
}

function mostrarIndicadorSalvamento() {
  // Indicador de rodapé removido a pedido do usuário
}

// ==========================================================================
// Renderização Principal
// ==========================================================================
function renderApp() {
  atualizarTituloAbaNavegador();
  const ciclo = getCicloVisualizado();
  
  // Apuração oficial completa de todos os sorteios do ciclo
  const apuracaoCompleta = BolaoEngine.apurar(ciclo.apostas, ciclo.concursos);
  const taxa = (ciclo.taxaOrganizador !== undefined ? ciclo.taxaOrganizador : state.taxaOrganizadorGlobal) ?? 0.20;
  const isDinamico = ciclo.premioQuadraDinamico !== false;
  const premioQuadra = typeof ciclo.premioQuadra === 'number' ? ciclo.premioQuadra : 0.0;
  
  // Apura se houve quadra no 1º sorteio do ciclo
  const quadraPremiada = apuracaoCompleta.ganhadoresQuadraPrimeiroSorteio && apuracaoCompleta.ganhadoresQuadraPrimeiroSorteio.length > 0;
  const financeiro = BolaoEngine.calcularFinanceiro(ciclo.apostas, ciclo.valorCota, taxa, premioQuadra, quadraPremiada, isDinamico);

  // ENCERRAMENTO IMEDIATO DO CICLO SE IDENTIFICADO 1 OU MAIS GANHADORES DA SENA (6 ACERTOS)
  if (apuracaoCompleta.temVencedorSena && ciclo.status !== 'finalizado') {
    ciclo.status = 'finalizado';
    ciclo.finalizadoEm = ciclo.finalizadoEm || new Date().toISOString();
    if (ciclo.concursos && ciclo.concursos.length > 0) {
      ciclo.concursoFinal = ciclo.concursos[ciclo.concursos.length - 1].numero;
    }
    ciclo.ganhadorSenaNome = apuracaoCompleta.ganhadoresSena.map(g => g.nome).join(', ');
    salvarEstado();
  }

  // Verifica se o usuário selecionou uma apuração retroativa/passo a passo (filtro até o N-ésimo concurso)
  let concursosApuracao = ciclo.concursos;
  let apuracao = apuracaoCompleta;

  if (state.filtroConcursoAteIndex !== null && typeof state.filtroConcursoAteIndex === 'number') {
    if (state.filtroConcursoAteIndex >= 0 && state.filtroConcursoAteIndex < ciclo.concursos.length) {
      concursosApuracao = ciclo.concursos.slice(0, state.filtroConcursoAteIndex + 1);
      apuracao = BolaoEngine.apurar(ciclo.apostas, concursosApuracao);
    } else {
      state.filtroConcursoAteIndex = null;
    }
  }

  renderCicloBar();
  renderHeader(ciclo, financeiro, concursosApuracao);
  renderBannerCicloEncerrado(ciclo, apuracaoCompleta);
  renderBtnFinalizarApostas(ciclo);
  renderBotoesSorteio(ciclo);
  renderKPIs(apuracao, financeiro, ciclo);
  renderConcursosBar(ciclo, concursosApuracao);
  renderLegenda(ciclo, concursosApuracao);
  renderTabelaApostas(ciclo, apuracao);
  
  if (state.filtroConcursoAteIndex === null) {
    verificarAlertasEspeciais(ciclo, apuracaoCompleta);
  }
}

function renderBotoesSorteio(ciclo) {
  const btnSync = document.getElementById('btn-sync-caixa');
  const btnManual = document.getElementById('btn-manual-sorteio');
  if (!btnSync || !btnManual) return;

  if (ciclo.status === 'finalizado') {
    btnSync.disabled = true;
    btnSync.style.opacity = '0.5';
    btnSync.style.cursor = 'not-allowed';
    btnSync.title = `Edição encerrada. Ganhador(es) da Sena: ${ciclo.ganhadorSenaNome || 'identificado(s)'}.`;
    btnManual.disabled = true;
    btnManual.style.opacity = '0.5';
    btnManual.style.cursor = 'not-allowed';
    btnManual.title = `Edição encerrada. Ganhador(es) da Sena: ${ciclo.ganhadorSenaNome || 'identificado(s)'}.`;
  } else {
    btnSync.disabled = false;
    btnSync.style.opacity = '1';
    btnSync.style.cursor = 'pointer';
    btnSync.title = 'Busca o próximo concurso na API oficial';
    btnManual.disabled = false;
    btnManual.style.opacity = '1';
    btnManual.style.cursor = 'pointer';
    btnManual.title = 'Digitar dezenas manualmente';
  }
}

function renderBtnFinalizarApostas(ciclo) {
  const btn = document.getElementById('btn-modal-finalizar-apostas');
  const btnNova = document.getElementById('btn-modal-nova-aposta');
  const btnWhats = document.getElementById('btn-modal-whatsapp');

  const isFechado = ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado';

  // Bloqueio rigoroso de acionamento de novas apostas no toolbar
  if (btnNova) {
    btnNova.disabled = isFechado;
    btnNova.style.opacity = isFechado ? '0.5' : '1';
    btnNova.style.cursor = isFechado ? 'not-allowed' : 'pointer';
    btnNova.title = isFechado ? '🔒 Apostas fechadas nesta edição (bloqueado para adições)' : 'Cadastrar nova aposta individual';
  }

  if (btnWhats) {
    btnWhats.disabled = isFechado;
    btnWhats.style.opacity = isFechado ? '0.5' : '1';
    btnWhats.style.cursor = isFechado ? 'not-allowed' : 'pointer';
    btnWhats.title = isFechado ? '🔒 Apostas fechadas nesta edição (bloqueado para importações)' : 'Importar lista de apostas do WhatsApp';
  }

  if (!btn) return;
  if (ciclo.status === 'finalizado') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-flex';
  if (ciclo.faseApostas === 'fechada') {
    btn.className = 'btn btn-secondary';
    btn.innerHTML = '<span class="btn-icon">🔒</span> Apostas Fechadas (Travado)';
    btn.title = 'Inscrições encerradas. O bolão está travado contra alterações.';
  } else {
    btn.className = 'btn btn-warning';
    btn.innerHTML = '<span class="btn-icon">🔒</span> Finalizar Apostas';
    btn.title = 'Encerrar período de inscrições/renovações e excluir desistentes';
  }
}

function renderBannerCicloEncerrado(ciclo, apuracao) {
  const banner = document.getElementById('banner-ciclo-encerrado');
  if (!banner) return;

  if (ciclo.status === 'finalizado') {
    banner.classList.remove('hidden');
    const titulo = document.getElementById('banner-encerrado-titulo');
    const sub = document.getElementById('banner-encerrado-sub');
    const input = document.getElementById('banner-quick-concurso');
    const btnSubmit = document.getElementById('btn-banner-quick-submit');

    let proximoNumero = 3061;
    if (ciclo.concursos && ciclo.concursos.length > 0) {
      proximoNumero = ciclo.concursos[ciclo.concursos.length - 1].numero + 1;
    } else if (ciclo.concursoInicial) {
      proximoNumero = ciclo.concursoInicial + 1;
    }

    const proxNome = `Edição ${state.ciclos.length + 1}`;
    const nomeEdicao = (ciclo.nome || 'Edição').replace(/Ciclo\s*/i, 'Edição ');
    if (titulo) {
      const vencedor = ciclo.ganhadorSenaNome || (apuracao.ganhadoresSena.length > 0 ? apuracao.ganhadoresSena.map(g => g.nome).join(', ') : 'Ganhador da Sena');
      titulo.textContent = `🏆 ${nomeEdicao} encerrada automaticamente! Ganhador(es) da Sena: ${vencedor}`;
    }
    if (sub) {
      sub.textContent = `Para abrir a ${proxNome} com todas as apostas renovadas, informe apenas o concurso inicial:`;
    }
    if (input) {
      input.value = proximoNumero;
    }
    if (btnSubmit) {
      btnSubmit.textContent = `🚀 Iniciar ${proxNome}`;
    }
  } else {
    banner.classList.add('hidden');
  }
}

let gruposFinalizarAtual = null;

function abrirModalFinalizarApostas(ciclo) {
  const todas = ciclo.apostas || [];

  // Categorização das apostas
  const mantidasConfirmadas = todas.filter(a => (a.pago || a.confirmada) && (a.origem === 'mantida' || !a.origem));
  const novasEAlteradas = todas.filter(a => (a.pago || a.confirmada) && (a.origem === 'nova' || a.origem === 'alterada'));
  const desistentes = todas.filter(a => !(a.pago || a.confirmada));

  gruposFinalizarAtual = {
    mantidasConfirmadas,
    novasEAlteradas,
    desistentes
  };

  // Atualiza métricas nos 3 cards
  document.getElementById('finalizar-total-mantidas').textContent = mantidasConfirmadas.length.toLocaleString('pt-BR');
  document.getElementById('finalizar-total-novas').textContent = novasEAlteradas.length.toLocaleString('pt-BR');
  document.getElementById('finalizar-total-desistentes').textContent = desistentes.length.toLocaleString('pt-BR');

  // Abas contadores
  document.getElementById('tab-count-desistentes').textContent = desistentes.length.toLocaleString('pt-BR');
  document.getElementById('tab-count-mantidas').textContent = mantidasConfirmadas.length.toLocaleString('pt-BR');
  document.getElementById('tab-count-novas').textContent = novasEAlteradas.length.toLocaleString('pt-BR');

  // Simulação financeira
  const totalValidasFinais = mantidasConfirmadas.length + novasEAlteradas.length;
  const valorCota = ciclo.valorCota || 24.0;
  const taxa = typeof ciclo.taxaOrganizador === 'number' ? ciclo.taxaOrganizador : state.taxaOrganizadorGlobal;
  const brutoFinal = totalValidasFinais * valorCota;
  const taxaFinal = brutoFinal * taxa;
  const premioQuadra = typeof ciclo.premioQuadra === 'number' ? ciclo.premioQuadra : 0.0;
  const liquidoFinal = brutoFinal - taxaFinal - (ciclo.quadraPremiada ? premioQuadra : 0);

  document.getElementById('finalizar-fin-apostas').textContent = totalValidasFinais.toLocaleString('pt-BR');
  document.getElementById('finalizar-fin-bruto').textContent = formatarMoeda(brutoFinal);
  document.getElementById('finalizar-fin-taxa').textContent = formatarMoeda(taxaFinal);
  document.getElementById('finalizar-fin-liquido').textContent = formatarMoeda(liquidoFinal);

  // Estado do botão de ação e alertas de fechamento
  const btnConfirmar = document.getElementById('btn-confirmar-fechamento-apostas');
  const alertWarning = document.getElementById('finalizar-warning-alert');
  const alertLocked = document.getElementById('finalizar-locked-alert');
  const badgeFechado = document.getElementById('badge-fechado-permanente');

  const nomeEdicao = (ciclo.nome || 'Edição').replace(/Ciclo\s*/i, 'Edição ');
  if (ciclo.faseApostas === 'fechada') {
    if (btnConfirmar) btnConfirmar.classList.add('hidden');
    if (alertWarning) alertWarning.classList.add('hidden');
    if (alertLocked) alertLocked.classList.remove('hidden');
    if (badgeFechado) badgeFechado.classList.remove('hidden');
    document.getElementById('modal-finalizar-title').textContent = `Resumo de Apostas Fechadas (Travado) — ${nomeEdicao}`;
    document.getElementById('modal-finalizar-desc').textContent = `As inscrições desta edição estão permanentemente encerradas. O bolão está travado e blindado com ${todas.length} apostas confirmadas concorrendo nos sorteios.`;
  } else {
    if (btnConfirmar) btnConfirmar.classList.remove('hidden');
    if (alertWarning) alertWarning.classList.remove('hidden');
    if (alertLocked) alertLocked.classList.add('hidden');
    if (badgeFechado) badgeFechado.classList.add('hidden');
    document.getElementById('modal-finalizar-title').textContent = `Finalizar Apostas — ${nomeEdicao}`;
    document.getElementById('modal-finalizar-desc').textContent = `Encerre o período de inscrições. As apostas não confirmadas serão excluídas desta edição e não concorrerão nos sorteios!`;
  }

  // Renderiza a aba padrão (Desistentes se houver, ou Mantidas)
  let abaAtiva = desistentes.length > 0 ? 'desistentes' : 'mantidas';
  document.querySelectorAll('.finalizar-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === abaAtiva);
  });
  renderAbaFinalizar(abaAtiva, gruposFinalizarAtual);

  abrirModal('modal-finalizar-apostas');
}

function renderAbaFinalizar(tabName, grupos) {
  const container = document.getElementById('finalizar-list');
  if (!container || !grupos) return;
  container.innerHTML = '';

  let listaExibir = [];
  let classeItem = '';
  let badgeTexto = '';

  if (tabName === 'desistentes') {
    listaExibir = grupos.desistentes;
    classeItem = 'desistente';
    badgeTexto = '⚠️ Desistente (Não Confirmou)';
  } else if (tabName === 'mantidas') {
    listaExibir = grupos.mantidasConfirmadas;
    badgeTexto = '✅ Mantida & Confirmada';
  } else if (tabName === 'novas') {
    listaExibir = grupos.novasEAlteradas;
    badgeTexto = '🆕 Nova / Alterada';
  }

  if (listaExibir.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 16px; text-align: center;">Nenhuma aposta nesta categoria.</p>';
    return;
  }

  const maxExibir = 100;
  const itens = listaExibir.slice(0, maxExibir);

  itens.forEach(a => {
    const div = document.createElement('div');
    div.className = `finalizar-item ${classeItem}`;
    div.innerHTML = `
      <div>
        <strong>${escapeHTML(a.nome)}</strong>
        <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 8px;">[${(a.dezenas || []).join(' ')}]</span>
      </div>
      <span class="badge-origem ${tabName === 'desistentes' ? 'alterada' : 'mantida'}" style="font-size: 0.72rem;">${badgeTexto}</span>
    `;
    container.appendChild(div);
  });

  if (listaExibir.length > maxExibir) {
    const hint = document.createElement('div');
    hint.style.cssText = 'text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 8px;';
    hint.textContent = `... e mais ${(listaExibir.length - maxExibir).toLocaleString('pt-BR')} apostas nesta categoria.`;
    container.appendChild(hint);
  }
}

function renderCicloBar() {
  const select = document.getElementById('select-ciclo');
  select.innerHTML = '';

  state.ciclos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    const statusTxt = c.status === 'ativo' ? '🟢 Ativa' : '⚪ Finalizada';
    const numSorteios = (c.concursos || []).length;
    const nomeExibicao = (c.nome || 'Edição').replace(/Ciclo\s*/i, 'Edição ');
    opt.textContent = `${nomeExibicao} (${numSorteios} sorteios) — ${statusTxt}`;
    if (c.id === state.cicloVisualizadoId) opt.selected = true;
    select.appendChild(opt);
  });

  // O botão '+ Nova Edição' só fica ativo quando a edição anterior for finalizada
  const btnNovoCiclo = document.getElementById('btn-modal-novo-ciclo');
  if (btnNovoCiclo) {
    const ultimaEdicao = state.ciclos[state.ciclos.length - 1];
    const finalizada = ultimaEdicao ? ultimaEdicao.status === 'finalizado' : false;

    if (finalizada) {
      btnNovoCiclo.disabled = false;
      btnNovoCiclo.classList.remove('disabled');
      btnNovoCiclo.style.opacity = '1';
      btnNovoCiclo.style.cursor = 'pointer';
      btnNovoCiclo.title = 'A edição anterior foi finalizada. Clique para iniciar a próxima edição.';
    } else {
      btnNovoCiclo.disabled = true;
      btnNovoCiclo.classList.add('disabled');
      btnNovoCiclo.style.opacity = '0.45';
      btnNovoCiclo.style.cursor = 'not-allowed';
      const nomeUltima = ultimaEdicao ? (ultimaEdicao.nome || 'Edição atual') : 'Edição atual';
      btnNovoCiclo.title = `🔒 A ${nomeUltima} ainda está em andamento. Este botão só fica ativo quando a edição anterior for finalizada.`;
    }
  }
}

function renderHeader(ciclo, financeiro, concursosApuracao) {
  const cicloInfo = document.getElementById('header-ciclo-info');
  const concursosBadge = document.getElementById('header-concursos-badge');
  const tituloHistorico = document.getElementById('titulo-historico-ciclo');

  const nomeExibicao = (ciclo.nome || 'Edição').replace(/Ciclo\s*/i, 'Edição ');

  if (tituloHistorico) {
    tituloHistorico.textContent = `Sorteios Realizados na ${nomeExibicao} ${ciclo.status === 'finalizado' ? '(Encerrada)' : ''}`;
  }

  if (ciclo.concursos.length === 0) {
    cicloInfo.textContent = `${nomeExibicao} — Inicial: ${ciclo.concursoInicial}`;
    concursosBadge.textContent = '0 sorteios na edição';
    concursosBadge.style.color = '';
  } else if (state.filtroConcursoAteIndex !== null && state.filtroConcursoAteIndex < ciclo.concursos.length) {
    const conc = ciclo.concursos[state.filtroConcursoAteIndex];
    cicloInfo.textContent = `${nomeExibicao} (Até Conc. ${conc.numero})`;
    concursosBadge.textContent = `${state.filtroConcursoAteIndex + 1} de ${ciclo.concursos.length} sorteios (Filtrado)`;
    concursosBadge.style.color = 'var(--gold-primary)';
  } else {
    const primeiro = ciclo.concursos[0].numero;
    const ultimo = ciclo.concursos[ciclo.concursos.length - 1].numero;
    cicloInfo.textContent = primeiro === ultimo ? `${nomeExibicao} (Conc. ${primeiro})` : `${nomeExibicao} (Conc. ${primeiro} a ${ultimo})`;
    concursosBadge.textContent = `${ciclo.concursos.length} ${ciclo.concursos.length === 1 ? 'sorteio acumulado' : 'sorteios acumulados'} na edição`;
    concursosBadge.style.color = '';
  }
}

function renderKPIs(apuracao, financeiro, ciclo) {
  document.getElementById('kpi-total-apostas').textContent = financeiro.totalApostas.toLocaleString('pt-BR');
  const labelApostadores = financeiro.totalApostadores === 1 ? 'apostador' : 'apostadores';
  document.getElementById('kpi-total-apostadores').textContent = `${financeiro.totalApostadores.toLocaleString('pt-BR')} ${labelApostadores}`;

  // 1. Quadro de Prêmio Líquido (com detalhamento da Quadra e da Sena)
  const elPremioLiquido = document.getElementById('kpi-premio-liquido');
  const elPremioQuadraInfo = document.getElementById('kpi-premio-quadra-info');

  if (financeiro.valorPagoQuadra > 0) {
    // Quadra foi premiada no 1º sorteio: deduz do prêmio da Sena
    elPremioLiquido.textContent = formatarMoeda(financeiro.premioSenaLiquido);
    elPremioQuadraInfo.innerHTML = `🎯 Quadra (1º Sorteio): <strong>${formatarMoeda(financeiro.valorPagoQuadra)}</strong> (Deduzido)`;
    elPremioQuadraInfo.style.color = 'var(--gold-primary)';
  } else if (financeiro.premioQuadraConfig > 0) {
    // Quadra configurada / calculada dinamicamente
    elPremioLiquido.textContent = formatarMoeda(financeiro.premioSenaLiquido);
    const labelQuadra = financeiro.premioQuadraDinamico ? '🎯 Quadra Dinâmica (10% Líquido):' : '🎯 Quadra Estipulada:';
    elPremioQuadraInfo.innerHTML = `${labelQuadra} <strong>${formatarMoeda(financeiro.premioQuadraConfig)}</strong> (1º Sorteio)`;
    elPremioQuadraInfo.style.color = 'var(--text-secondary)';
  } else {
    // Sem quadra ou 0 cotas pagas
    elPremioLiquido.textContent = formatarMoeda(financeiro.totalLiquidoGeralArrecadado);
    if (financeiro.premioQuadraDinamico) {
      elPremioQuadraInfo.textContent = '🎯 Quadra Dinâmica: R$ 0,00 (Aguardando cotas pagas)';
    } else {
      elPremioQuadraInfo.textContent = '🎯 Quadra: Não configurada';
    }
    elPremioQuadraInfo.style.color = 'var(--text-muted)';
  }

  // 2. Taxa do Organizador (20%)
  document.getElementById('kpi-taxa-organizador').textContent = formatarMoeda(financeiro.valorOrganizadorArrecadado);
  document.getElementById('kpi-taxa-prevista-sub').textContent = `Previsto: ${formatarMoeda(financeiro.valorOrganizadorPrevisto)}`;

  // 3. Pendente
  document.getElementById('kpi-total-pendente').textContent = formatarMoeda(financeiro.totalPendenteBruto);
  const labelPendentes = financeiro.pendentes === 1 ? '1 aposta pendente' : `${financeiro.pendentes} apostas pendentes`;
  document.getElementById('kpi-pendentes-contagem').textContent = labelPendentes;

  // 4. Maior Pontuação
  const kpiLiderAcertos = document.getElementById('kpi-lider-acertos');
  const kpiLiderNome = document.getElementById('kpi-lider-nome');

  if (apuracao.maiorPontuacao > 0 && apuracao.apostasLideres.length > 0) {
    kpiLiderAcertos.textContent = `${apuracao.maiorPontuacao} / 6`;
    const primeiroLider = apuracao.apostasLideres[0].nome;
    const outros = apuracao.apostasLideres.length - 1;
    kpiLiderNome.textContent = outros > 0 ? `${primeiroLider} (+${outros} empatados)` : primeiroLider;
  } else {
    kpiLiderAcertos.textContent = '0 / 6';
    kpiLiderNome.textContent = getCicloVisualizado().concursos.length === 0 ? 'Aguardando 1º sorteio' : 'Nenhum acerto ainda';
  }

  // Contadores nas abas
  document.getElementById('count-todos').textContent = financeiro.totalApostas.toLocaleString('pt-BR');
  document.getElementById('count-pagos').textContent = financeiro.pagas.toLocaleString('pt-BR');
  document.getElementById('count-pendentes').textContent = financeiro.pendentes.toLocaleString('pt-BR');
}

function renderConcursosBar(ciclo, concursosApuracao) {
  const container = document.getElementById('concursos-tags-container');
  container.innerHTML = '';

  if (ciclo.concursos.length === 0) {
    if (state.isAdmin) {
      container.innerHTML = `<span class="empty-concursos-hint">Nenhum sorteio adicionado na <strong>${escapeHTML(ciclo.nome)}</strong>. Clique em <strong>"Buscar Próximo Sorteio"</strong> para sincronizar com a Caixa ou insira manualmente.</span>`;
    } else {
      container.innerHTML = `<span class="empty-concursos-hint">Nenhum sorteio realizado ainda na <strong>${escapeHTML(ciclo.nome)}</strong>. Aguardando a apuração do primeiro concurso da Mega-Sena.</span>`;
    }
    return;
  }

  // Se houver filtro ativo, exibe barra informativa destacada com botão para restaurar
  if (state.filtroConcursoAteIndex !== null && state.filtroConcursoAteIndex < ciclo.concursos.length) {
    const concAlvo = ciclo.concursos[state.filtroConcursoAteIndex];
    const avisoFiltro = document.createElement('div');
    avisoFiltro.className = 'concurso-filtro-banner';
    avisoFiltro.innerHTML = `
      <div class="concurso-filtro-info">
        <span class="filtro-pulsing-icon">🎯</span>
        <span>Visualizando apuração acumulada <strong>até o ${state.filtroConcursoAteIndex + 1}º Sorteio (Concurso ${concAlvo.numero})</strong></span>
      </div>
      <button type="button" class="btn-reset-filtro-concurso" id="btn-reset-concurso-filtro" title="Restaurar visualização de todos os sorteios">
        🔄 Ver Todos os Sorteios (${ciclo.concursos.length})
      </button>
    `;
    container.appendChild(avisoFiltro);

    setTimeout(() => {
      document.getElementById('btn-reset-concurso-filtro')?.addEventListener('click', () => {
        state.filtroConcursoAteIndex = null;
        state.paginaAtual = 1;
        renderApp();
      });
    }, 0);
  }

  ciclo.concursos.forEach((c, idx) => {
    const estilo = BolaoEngine.getCorConcurso(idx);
    const card = document.createElement('div');
    card.className = 'concurso-badge-card';
    card.style.setProperty('--tag-color', estilo.bg);
    card.style.setProperty('--tag-text', estilo.text);

    const isFiltrado = state.filtroConcursoAteIndex !== null;
    const isAlvo = isFiltrado && state.filtroConcursoAteIndex === idx;
    const isIncluido = isFiltrado && idx <= state.filtroConcursoAteIndex;
    const isExcluido = isFiltrado && idx > state.filtroConcursoAteIndex;

    if (isAlvo) {
      card.classList.add('is-alvo');
    } else if (isIncluido) {
      card.classList.add('is-incluido');
    } else if (isExcluido) {
      card.classList.add('is-excluido');
    }

    const dicaAcao = isAlvo
      ? 'Clique para voltar a ver todos os sorteios'
      : (idx === 0 
          ? `Clique para ver quem acertou no 1º Sorteio (Conc. ${c.numero})`
          : `Clique para ver os resultados acumulados do 1º até o ${idx + 1}º Sorteio (Conc. ${c.numero})`);

    card.title = dicaAcao;

    const indicadorAlvoHtml = isAlvo 
      ? `<span class="badge-alvo-tag">⭐ Acumulado até aqui</span>` 
      : '';

    card.innerHTML = `
      <div class="concurso-badge-top">
        <span class="num">
          Concurso ${c.numero}
          <span class="badge-seq">${idx + 1}º</span>
        </span>
        <span class="date">${c.dataApuracao || ''}</span>
      </div>
      <div class="concurso-dezenas-row">
        ${c.dezenas.map(d => `<span class="dezena-mini-pill">${d}</span>`).join('')}
      </div>
      ${indicadorAlvoHtml}
    `;

    card.addEventListener('click', () => {
      if (state.filtroConcursoAteIndex === idx) {
        state.filtroConcursoAteIndex = null;
      } else {
        state.filtroConcursoAteIndex = idx;
      }
      state.paginaAtual = 1;
      renderApp();
    });

    container.appendChild(card);
  });
}

function renderLegenda(ciclo, concursosApuracao) {
  const itemsContainer = document.getElementById('legend-items');
  itemsContainer.innerHTML = '';

  if (ciclo.concursos.length === 0) {
    itemsContainer.innerHTML = '<span style="color: var(--text-muted);">Cores serão ativadas no 1º concurso da edição.</span>';
    return;
  }

  ciclo.concursos.forEach((c, idx) => {
    const estilo = BolaoEngine.getCorConcurso(idx);
    const pill = document.createElement('div');
    pill.className = 'legend-pill';

    if (state.filtroConcursoAteIndex !== null && idx > state.filtroConcursoAteIndex) {
      pill.style.opacity = '0.35';
      pill.style.filter = 'grayscale(60%)';
    }

    pill.innerHTML = `
      <span class="legend-color-dot" style="background-color: ${estilo.bg};"></span>
      <span>${idx + 1}º Sorteio (Conc. ${c.numero})</span>
    `;
    itemsContainer.appendChild(pill);
  });
}

function renderTabelaApostas(ciclo, apuracao) {
  const tbody = document.getElementById('tabela-apostas-body');
  const paginationBar = document.getElementById('pagination-bar');
  tbody.innerHTML = '';

  let lista = [...apuracao.apostas];

  if (state.buscaTexto) {
    const termo = state.buscaTexto.toLowerCase();
    lista = lista.filter(a => a.nome.toLowerCase().includes(termo));
  }

  const chipLideres = document.querySelector('.filter-chip[data-filter="lideres"]');
  const minLideres = (apuracao.maiorPontuacao >= 4) ? 4 : (apuracao.maiorPontuacao > 0 ? apuracao.maiorPontuacao : 4);
  if (chipLideres) {
    chipLideres.textContent = minLideres >= 4 ? 'Líderes (4+ acertos)' : `Líderes (${minLideres} acertos)`;
  }

  if (state.filtroAtual === 'pagos') {
    lista = lista.filter(a => a.pago);
  } else if (state.filtroAtual === 'pendentes') {
    lista = lista.filter(a => !a.pago);
  } else if (state.filtroAtual === 'lideres') {
    lista = lista.filter(a => a.totalAcertos >= minLideres);
  }

  lista.sort((a, b) => b.totalAcertos - a.totalAcertos || a.nome.localeCompare(b.nome));

  const totalFiltradas = lista.length;

  if (totalFiltradas === 0) {
    paginationBar.classList.add('hidden');
    return;
  } else {
    paginationBar.classList.remove('hidden');
  }

  // Paginação
  const totalPaginas = Math.ceil(totalFiltradas / state.itensPorPagina) || 1;
  if (state.paginaAtual > totalPaginas) state.paginaAtual = totalPaginas;
  if (state.paginaAtual < 1) state.paginaAtual = 1;

  const inicioIdx = (state.paginaAtual - 1) * state.itensPorPagina;
  const fimIdx = Math.min(inicioIdx + state.itensPorPagina, totalFiltradas);
  const paginaApostas = lista.slice(inicioIdx, fimIdx);

  document.getElementById('pag-inicio').textContent = (inicioIdx + 1).toLocaleString('pt-BR');
  document.getElementById('pag-fim').textContent = fimIdx.toLocaleString('pt-BR');
  document.getElementById('pag-total').textContent = totalFiltradas.toLocaleString('pt-BR');
  const elLabelApostas = document.getElementById('pag-label-apostas');
  if (elLabelApostas) {
    elLabelApostas.textContent = totalFiltradas === 1 ? 'aposta' : 'apostas';
  }
  document.getElementById('pagination-page-current').textContent = `Página ${state.paginaAtual} de ${totalPaginas}`;
  document.getElementById('btn-page-prev').disabled = state.paginaAtual <= 1;
  document.getElementById('btn-page-next').disabled = state.paginaAtual >= totalPaginas;

  const isFinalizado = ciclo.status === 'finalizado';
  const fragment = document.createDocumentFragment();

  paginaApostas.forEach((aposta, indexRelativo) => {
    const tr = document.createElement('tr');
    const indexAbsoluto = inicioIdx + indexRelativo + 1;

    if (aposta.totalAcertos > 0 && aposta.totalAcertos === apuracao.maiorPontuacao) {
      tr.classList.add('is-leader');
    }

    const dezenasHtml = (aposta.dezenasDetalhes || []).map(dez => {
      if (dez.acertou) {
        return `
          <div class="dezena-ball hit" style="background-color: ${dez.bg}; color: ${dez.text};" title="Sorteado no Concurso ${dez.concursoNumero}">
            ${dez.numero}
          </div>
        `;
      }
      return `
        <div class="dezena-ball">
          ${dez.numero}
        </div>
      `;
    }).join('');

    let badgeClass = 'acertos-score';
    if (aposta.totalAcertos >= 6) badgeClass += ' is-winner';
    else if (aposta.totalAcertos >= 4) badgeClass += ' is-high';
    else if (aposta.totalAcertos > 0) badgeClass += ' has-hits';

    const isBloqueado = ciclo.faseApostas === 'fechada' || isFinalizado;
    const isConfirmada = !!(aposta.confirmada || aposta.pago);
    const pagoHtml = isConfirmada
      ? `<button class="payment-toggle pago" onclick="togglePagamentoAposta('${aposta.id}')" ${isBloqueado ? 'disabled' : ''} title="${isBloqueado ? 'Apostas fechadas (bloqueado contra alterações)' : 'Aposta confirmada'}">✅ Confirmada</button>`
      : `<button class="payment-toggle pendente" onclick="togglePagamentoAposta('${aposta.id}')" ${isBloqueado ? 'disabled' : ''} title="${isBloqueado ? 'Apostas fechadas (bloqueado contra alterações)' : 'Aguardando confirmação'}">⏳ Aguardando</button>`;

    const origemBadge = state.isAdmin ? (
      aposta.origem === 'nova' 
        ? `<span class="badge-origem nova admin-only" title="Novo participante">Nova</span>`
        : aposta.origem === 'alterada'
        ? `<span class="badge-origem alterada admin-only" title="Números alterados">Alterada</span>`
        : `<span class="badge-origem mantida admin-only" title="Jogo mantido da edição anterior">Mantida</span>`
    ) : '';

    const isCampeao = aposta.totalAcertos >= 6;
    const campeaoTag = isCampeao ? `<div class="campeao-slot"><span class="badge-campeao-sena">🏆 CAMPEÃO</span></div>` : '';

    if (isCampeao) {
      tr.classList.add('is-champion-row');
    }

    tr.innerHTML = `
      <td class="td-num">${indexAbsoluto}</td>
      <td class="td-nome">
        <div class="nome-col-wrapper">
          <span class="mobile-rank-badge">#${indexAbsoluto}</span>
          <div class="nome-info">
            <strong>${escapeHTML(aposta.nome)}</strong> ${origemBadge}
            ${state.isAdmin && aposta.observacao && !aposta.observacao.includes('Importado do PDF') ? `<small class="admin-only">${escapeHTML(aposta.observacao)}</small>` : ''}
          </div>
        </div>
      </td>
      <td class="td-dezenas">
        <div class="dezenas-container">${dezenasHtml}</div>
      </td>
      <td class="td-acertos">
        <div class="acertos-badge-wrap">
          <span class="${badgeClass}">${aposta.totalAcertos} / 6</span>
          ${campeaoTag}
        </div>
      </td>
      <td class="td-status admin-only">${pagoHtml}</td>
      <td class="td-acoes admin-only">
        ${!isBloqueado ? `
          <button class="btn-table-action" onclick="editarAposta('${escapeHTML(aposta.id)}')" title="Editar">✏️</button>
          <button class="btn-table-action delete" onclick="excluirAposta('${escapeHTML(aposta.id)}')" title="Excluir">🗑️</button>
        ` : `<span style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05);" title="Apostas fechadas nesta edição. Alterações não permitidas nem mesmo pelo administrador.">🔒 Fechada</span>`}
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

// ==========================================================================
// Alertas Especiais (Quadra e Sena)
// ==========================================================================
function verificarAlertasEspeciais(ciclo, apuracao) {
  const cicloIdStr = `c_${ciclo.id}_${ciclo.concursos.map(c => c.numero).join('-')}`;
  if (!ciclo.alertasExibidos) {
    ciclo.alertasExibidos = { quadraCicloId: null, senaCicloId: null };
  }

  // 1. Quadra no 1º sorteio
  if (ciclo.concursos.length === 1 && apuracao.temVencedorQuadraPrimeiroSorteio) {
    if (ciclo.alertasExibidos.quadraCicloId !== cicloIdStr) {
      exibirModalQuadra(apuracao.ganhadoresQuadraPrimeiroSorteio);
      ciclo.alertasExibidos.quadraCicloId = cicloIdStr;
      ciclo.ganhadorQuadraNome = apuracao.ganhadoresQuadraPrimeiroSorteio.map(g => g.nome).join(', ');
      salvarEstado();
    }
  }

  // 2. Sena (6 números) - ENCERRAMENTO AUTOMÁTICO DO CICLO
  if (apuracao.temVencedorSena) {
    if (ciclo.status !== 'finalizado') {
      ciclo.status = 'finalizado';
      ciclo.finalizadoEm = new Date().toISOString();
      if (ciclo.concursos && ciclo.concursos.length > 0) {
        ciclo.concursoFinal = ciclo.concursos[ciclo.concursos.length - 1].numero;
      }
      ciclo.ganhadorSenaNome = apuracao.ganhadoresSena.map(g => g.nome).join(', ');
      salvarEstado();
    }

    if (ciclo.alertasExibidos.senaCicloId !== cicloIdStr) {
      exibirModalSena(apuracao.ganhadoresSena, ciclo);
      ciclo.alertasExibidos.senaCicloId = cicloIdStr;
      salvarEstado();
    }
  }
}

function exibirModalQuadra(ganhadores) {
  const list = document.getElementById('quadra-ganhadores-list');
  const ciclo = getCicloVisualizado();
  const premioQuadraTexto = ciclo.premioQuadra > 0 ? ` (Prêmio: ${formatarMoeda(ciclo.premioQuadra)})` : '';

  list.innerHTML = ganhadores.map(g => `
    <div class="celebration-winner-card">
      <div>
        <strong>${escapeHTML(g.nome)}</strong>
        <p style="color: var(--text-secondary); font-size: 0.85rem;">Acertou ${g.acertosNoPrimeiroSorteio} dezenas na abertura da edição!${premioQuadraTexto}</p>
      </div>
      <span class="badge-seq" style="background: var(--gold-primary); color: #000; font-size: 0.9rem; padding: 4px 10px;">
        🎯 Quadra!
      </span>
    </div>
  `).join('');

  abrirModal('modal-quadra');
}

function exibirModalSena(ganhadores) {
  const list = document.getElementById('sena-ganhadores-list');
  list.innerHTML = ganhadores.map(g => `
    <div class="celebration-winner-card">
      <div>
        <strong style="color: var(--emerald-primary); font-size: 1.2rem;">${escapeHTML(g.nome)}</strong>
        <p style="color: var(--text-secondary); font-size: 0.9rem;">Cartela completa com 6 acertos acumulados!</p>
      </div>
      <span style="font-size: 1.8rem;">🏆</span>
    </div>
  `).join('');

  abrirModal('modal-sena');
}

// ==========================================================================
// Ações de Pagamento e Edição
// ==========================================================================
window.togglePagamentoAposta = function(id) {
  const ciclo = getCicloVisualizado();
  if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
    alert('🔒 Ação bloqueada: As apostas desta edição já estão fechadas! Conforme a regra de transparência, nem mesmo o administrador pode alterar o status de pagamento ou confirmação.');
    return;
  }
  const aposta = ciclo.apostas.find(a => a.id === id);
  if (aposta) {
    aposta.pago = !aposta.pago;
    aposta.confirmada = aposta.pago;
    salvarEstado();
    renderApp();
  }
};

window.excluirAposta = function(id) {
  const ciclo = getCicloVisualizado();
  if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
    alert('🔒 Ação bloqueada: As apostas desta edição já estão fechadas! Nenhuma aposta pode ser excluída, nem mesmo pelo administrador.');
    return;
  }
  const aposta = ciclo.apostas.find(a => a.id === id);
  if (!aposta) return;
  if (confirm(`Deseja realmente remover a aposta de "${aposta.nome}"?`)) {
    ciclo.apostas = ciclo.apostas.filter(a => a.id !== id);
    salvarEstado();
    renderApp();
  }
};

window.editarAposta = function(id) {
  const ciclo = getCicloVisualizado();
  if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
    alert('🔒 Ação bloqueada: As apostas desta edição já estão fechadas! Nenhuma aposta pode ser editada, nem mesmo pelo administrador.');
    return;
  }
  const aposta = ciclo.apostas.find(a => a.id === id);
  if (!aposta) return;

  document.getElementById('aposta-id').value = aposta.id;
  document.getElementById('aposta-nome').value = aposta.nome;
  const obsVal = aposta.observacao || '';
  document.getElementById('aposta-telefone').value = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarTelefoneOuTexto(obsVal) : obsVal;

  const inputs = document.querySelectorAll('#form-aposta .num-input');
  aposta.dezenas.forEach((d, idx) => {
    if (inputs[idx]) inputs[idx].value = parseInt(d, 10);
  });

  document.getElementById('modal-aposta-title').textContent = 'Editar Aposta';
  abrirModal('modal-aposta');
};

// ==========================================================================
// Event Listeners e Modais
// ==========================================================================
function setupEventListeners() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      fecharModal(modalId);
    });
  });

  // Clique fora da janela NÃO fecha o modal (evita fechamentos acidentais)
  // O fechamento só ocorre via tecla ESC ou botões explícitos (ex: X ou Cancelar)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
      if (openModals.length > 0) {
        // Fecha o modal ativo (o último na ordem do DOM)
        const topModal = openModals[openModals.length - 1];
        topModal.classList.add('hidden');
      }
    }
  });

  // Validação em tempo real para qualquer campo de alimentação de números de jogos (01 a 60)
  function configurarValidacaoNumerosJogos() {
    function validarElementoInput(input, tipoContexto) {
      const contextoMsg = tipoContexto === 'sorteio' ? 'no sorteio' : 'na aposta';

      function checarEAlertar() {
        const raw = input.value.trim();
        if (!raw) return true;

        const num = parseInt(raw, 10);
        if (isNaN(num) || num < 1 || num > 60 || raw === '00' || raw === '0') {
          alert(`⚠️ Número não permitido: "${raw}".\n\nNo SenaClube, os números ${contextoMsg} aceitam exclusivamente valores no intervalo de 01 a 60!`);
          input.value = '';
          setTimeout(() => input.focus(), 30);
          return false;
        } else {
          // Normaliza com zero à esquerda se for de 1 a 9
          input.value = num < 10 ? `0${num}` : `${num}`;
          return true;
        }
      }

      input.addEventListener('change', checarEAlertar);
      input.addEventListener('blur', checarEAlertar);

      input.addEventListener('input', () => {
        const raw = input.value.trim();
        if (!raw) return;

        // Se digitou 0 isolado, 00 ou negativo
        if (raw === '0' || raw === '00' || raw.startsWith('-')) {
          alert(`⚠️ Número não permitido: "${raw}".\n\nNo SenaClube, os números ${contextoMsg} aceitam exclusivamente valores no intervalo de 01 a 60!`);
          input.value = '';
          return;
        }

        const num = parseInt(raw, 10);
        if (!isNaN(num) && num > 60) {
          alert(`⚠️ Número não permitido: "${raw}".\n\nNo SenaClube, os números ${contextoMsg} aceitam exclusivamente valores no intervalo de 01 a 60!`);
          input.value = '';
          setTimeout(() => input.focus(), 30);
        }
      });
    }

    document.querySelectorAll('#form-aposta .num-input').forEach(inp => {
      validarElementoInput(inp, 'aposta');
    });

    document.querySelectorAll('#form-sorteio .num-sorteio-input').forEach(inp => {
      validarElementoInput(inp, 'sorteio');
    });
  }
  configurarValidacaoNumerosJogos();

  // Configura Máscaras em Tempo Real (CPF, Celular e Chave PIX)
  function configurarMascarasInputs() {
    if (typeof MaskUtils === 'undefined') return;

    // 1. Chave PIX do Organizador
    const configPix = document.getElementById('config-pix');
    const badgePix = document.getElementById('badge-tipo-pix');
    if (configPix) {
      const atualizarBadgePix = () => {
        if (!badgePix) return;
        const tipo = MaskUtils.identificarTipoPix(configPix.value);
        if (tipo === 'cpf') {
          badgePix.textContent = '📄 CPF';
          badgePix.style.color = '#10b981';
          badgePix.style.background = 'rgba(16, 185, 129, 0.15)';
          badgePix.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else if (tipo === 'celular') {
          badgePix.textContent = '📱 Celular';
          badgePix.style.color = '#60a5fa';
          badgePix.style.background = 'rgba(59, 130, 246, 0.15)';
          badgePix.style.borderColor = 'rgba(59, 130, 246, 0.3)';
        } else if (tipo === 'email') {
          badgePix.textContent = '✉️ E-mail';
          badgePix.style.color = '#a78bfa';
          badgePix.style.background = 'rgba(167, 139, 250, 0.15)';
          badgePix.style.borderColor = 'rgba(167, 139, 250, 0.3)';
        } else if (tipo === 'cnpj') {
          badgePix.textContent = '🏢 CNPJ';
          badgePix.style.color = '#f59e0b';
          badgePix.style.background = 'rgba(245, 158, 11, 0.15)';
          badgePix.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        } else if (tipo === 'aleatoria') {
          badgePix.textContent = '🔑 Aleatória';
          badgePix.style.color = '#ec4899';
          badgePix.style.background = 'rgba(236, 72, 153, 0.15)';
          badgePix.style.borderColor = 'rgba(236, 72, 153, 0.3)';
        } else {
          badgePix.textContent = '🔑 Chave PIX';
          badgePix.style.color = 'var(--text-muted)';
          badgePix.style.background = 'rgba(255, 255, 255, 0.05)';
          badgePix.style.borderColor = 'var(--border-color)';
        }
      };

      MaskUtils.aplicarMascaraInput(configPix, val => {
        const formatado = MaskUtils.formatarChavePix(val);
        setTimeout(atualizarBadgePix, 0);
        return formatado;
      });

      configPix.addEventListener('blur', atualizarBadgePix);
      configPix.addEventListener('input', atualizarBadgePix);
    }

    // 2. Celular / WhatsApp do Organizador
    const configCelular = document.getElementById('config-celular');
    if (configCelular) {
      MaskUtils.aplicarMascaraInput(configCelular, val => MaskUtils.formatarTelefone(val));
    }

    // 3. Chave PIX no modal de comunicados do WhatsApp
    const msgParamPix = document.getElementById('msg-param-pix');
    if (msgParamPix) {
      MaskUtils.aplicarMascaraInput(msgParamPix, val => MaskUtils.formatarChavePix(val));
    }

    // 4. Celular / Observação no cadastro e edição de aposta
    const apostaTel = document.getElementById('aposta-telefone');
    if (apostaTel) {
      MaskUtils.aplicarMascaraInput(apostaTel, val => MaskUtils.formatarTelefoneOuTexto(val));
    }
  }
  configurarMascarasInputs();

  // Paginação
  document.getElementById('btn-page-prev').addEventListener('click', () => {
    if (state.paginaAtual > 1) {
      state.paginaAtual--;
      renderApp();
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-page-next').addEventListener('click', () => {
    state.paginaAtual++;
    renderApp();
    window.scrollTo({ top: 380, behavior: 'smooth' });
  });

  // Troca de Ciclo no Seletor
  document.getElementById('select-ciclo').addEventListener('change', (e) => {
    state.cicloVisualizadoId = parseInt(e.target.value, 10);
    state.paginaAtual = 1;
    state.filtroConcursoAteIndex = null;
    renderApp();
  });

  // Modal Novo Ciclo
  document.getElementById('btn-modal-novo-ciclo').addEventListener('click', (e) => {
    const ultimoCiclo = state.ciclos[state.ciclos.length - 1] || getCicloVisualizado();
    if (ultimoCiclo && ultimoCiclo.status !== 'finalizado') {
      e.preventDefault();
      alert(`🔒 Ação Bloqueada:\n\nA ${ultimoCiclo.nome} ainda está em andamento!\n\nConforme as regras do SenaClube, o botão "+ Nova Edição" só fica ativo quando a edição anterior for oficialmente finalizada (após a premiação da Sena).`);
      return;
    }

    let proximoConcurso = 3060;
    if (ultimoCiclo.concursos && ultimoCiclo.concursos.length > 0) {
      proximoConcurso = ultimoCiclo.concursos[ultimoCiclo.concursos.length - 1].numero + 1;
    } else if (ultimoCiclo.concursoInicial) {
      proximoConcurso = ultimoCiclo.concursoInicial + 1;
    }

    const cotaPadrao = ultimoCiclo.valorCota || 30.0;
    const pagasEstimadas = (ultimoCiclo.apostas || []).filter(a => a.pago).length;
    const taxa = typeof ultimoCiclo.taxaOrganizador === 'number' ? ultimoCiclo.taxaOrganizador : (state.taxaOrganizadorGlobal || 0.20);
    // Dinâmico: 10% do valor líquido das apostas pagas (se 0 pagas, prêmio é 0)
    const quadraPadrao = BolaoEngine.calcularPremioQuadraPadrao(pagasEstimadas, cotaPadrao, taxa);

    document.getElementById('novo-ciclo-nome').value = `Edição ${state.ciclos.length + 1}`;
    document.getElementById('novo-ciclo-concurso').value = proximoConcurso;
    document.getElementById('novo-ciclo-cota').value = cotaPadrao;
    document.getElementById('novo-ciclo-premio-quadra').value = quadraPadrao;
    abrirModal('modal-novo-ciclo');
  });

  // Botão: Recalcular 10% do líquido no modal de novo ciclo
  document.getElementById('btn-recalc-quadra-novo')?.addEventListener('click', () => {
    const ultimoCiclo = state.ciclos[state.ciclos.length - 1] || getCicloVisualizado();
    const pagas = (ultimoCiclo.apostas || []).filter(a => a.pago).length;
    const cota = parseFloat(document.getElementById('novo-ciclo-cota').value) || 30.0;
    const taxa = state.taxaOrganizadorGlobal || 0.20;
    const valor = BolaoEngine.calcularPremioQuadraPadrao(pagas, cota, taxa);
    document.getElementById('novo-ciclo-premio-quadra').value = valor;
    mostrarNotificacaoToast(`⚡ Prêmio da Quadra calculado (10% do líquido de ${pagas} cota(s) paga(s)): R$ ${valor.toFixed(2).replace('.', ',')}`);
  });

  // Atualização automática ao digitar o valor da cota no novo ciclo
  document.getElementById('novo-ciclo-cota')?.addEventListener('input', (e) => {
    const cota = parseFloat(e.target.value) || 0;
    const ultimoCiclo = state.ciclos[state.ciclos.length - 1] || getCicloVisualizado();
    const pagas = (ultimoCiclo.apostas || []).filter(a => a.pago).length;
    const taxa = state.taxaOrganizadorGlobal || 0.20;
    const valor = BolaoEngine.calcularPremioQuadraPadrao(pagas, cota, taxa);
    document.getElementById('novo-ciclo-premio-quadra').value = valor;
  });

  // Form: Iniciar Novo Ciclo
  document.getElementById('form-novo-ciclo').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('novo-ciclo-nome').value.trim();
    const concursoInicial = parseInt(document.getElementById('novo-ciclo-concurso').value, 10);
    const valorCota = parseFloat(document.getElementById('novo-ciclo-cota').value) || 30.0;
    const copiarApostas = document.getElementById('novo-ciclo-copiar-apostas').checked;

    const cicloAtivo = state.ciclos.find(c => c.status === 'ativo');
    if (cicloAtivo) {
      cicloAtivo.status = 'finalizado';
      cicloAtivo.finalizadoEm = new Date().toISOString();
      if (cicloAtivo.concursos.length > 0) {
        cicloAtivo.concursoFinal = cicloAtivo.concursos[cicloAtivo.concursos.length - 1].numero;
      }
    }

    let apostasBase = [];
    if (copiarApostas && cicloAtivo) {
      apostasBase = cicloAtivo.apostas.map(a => ({
        id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        nome: a.nome,
        dezenas: [...a.dezenas],
        pago: false,
        confirmada: false,
        origem: 'mantida',
        observacao: 'Renovado da edição anterior',
        criadoEm: new Date().toISOString()
      }));
    }

    const taxaOrg = state.taxaOrganizadorGlobal || 0.20;
    let premioQuadra = parseFloat(document.getElementById('novo-ciclo-premio-quadra').value);
    if (isNaN(premioQuadra) || premioQuadra < 0) {
      premioQuadra = 0.0;
    }

    const novoId = Math.max(...state.ciclos.map(c => c.id)) + 1;
    const novoCiclo = {
      id: novoId,
      nome,
      status: 'ativo',
      concursoInicial,
      concursoFinal: null,
      valorCota,
      taxaOrganizador: taxaOrg,
      premioQuadra,
      premioQuadraDinamico: true,
      concursos: [],
      apostas: apostasBase,
      apostasDescartadas: [],
      faseApostas: 'aberta',
      alertasExibidos: { quadraCicloId: null, senaCicloId: null },
      ganhadorSenaNome: null,
      ganhadorQuadraNome: null,
      criadoEm: new Date().toISOString(),
      finalizadoEm: null
    };

    state.ciclos.push(novoCiclo);
    state.cicloVisualizadoId = novoId;
    state.paginaAtual = 1;

    salvarEstado();
    fecharModal('modal-novo-ciclo');
    renderApp();

    const infoQuadra = novoCiclo.premioQuadraDinamico ? 'Dinâmico (10% do líquido de cotas pagas)' : `R$ ${premioQuadra.toFixed(2).replace('.', ',')}`;
    alert(`🎉 ${nome} aberta com sucesso com concurso inicial ${concursoInicial}!\nPrêmio da Quadra: ${infoQuadra}.`);
  });

  // Form Quick: Iniciar Novo Ciclo via Banner
  const formBannerQuick = document.getElementById('form-banner-quick-ciclo');
  if (formBannerQuick) {
    formBannerQuick.addEventListener('submit', (e) => {
      e.preventDefault();
      const conc = document.getElementById('banner-quick-concurso').value;
      iniciarNovoCicloAutomatico(conc);
    });
  }

  // Modal Histórico de Ciclos
  document.getElementById('btn-modal-historico-ciclos').addEventListener('click', () => {
    renderModalHistoricoCiclos();
    abrirModal('modal-historico-ciclos');
  });

  // Busca e Filtros
  const inputSearch = document.getElementById('input-search');
  const btnClearSearch = document.getElementById('btn-clear-search');

  function atualizarVisibilidadeBotaoLimparBusca() {
    if (!btnClearSearch) return;
    if (inputSearch && inputSearch.value.trim().length > 0) {
      btnClearSearch.classList.remove('hidden');
    } else {
      btnClearSearch.classList.add('hidden');
    }
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      state.buscaTexto = e.target.value;
      state.paginaAtual = 1;
      atualizarVisibilidadeBotaoLimparBusca();
      renderApp();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (inputSearch) {
        inputSearch.value = '';
        inputSearch.focus();
      }
      state.buscaTexto = '';
      state.paginaAtual = 1;
      atualizarVisibilidadeBotaoLimparBusca();
      renderApp();
    });
  }

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filtroAtual = chip.getAttribute('data-filter');
      state.paginaAtual = 1;
      renderApp();
    });
  });

  // Botões de Abertura de Modais
  document.getElementById('btn-modal-nova-aposta').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
      alert('🔒 As apostas desta edição estão fechadas! Não é permitido cadastrar novas apostas.');
      return;
    }
    document.getElementById('form-aposta').reset();
    document.getElementById('aposta-id').value = '';
    document.getElementById('modal-aposta-title').textContent = 'Nova Aposta';
    abrirModal('modal-aposta');
  });

  document.getElementById('btn-modal-whatsapp').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
      alert('🔒 As apostas desta edição estão fechadas! Não é permitido importar apostas.');
      return;
    }
    const textEl = document.getElementById('whatsapp-raw-text');
    if (textEl) textEl.value = '';
    const pagoEl = document.getElementById('whatsapp-default-pago');
    if (pagoEl) pagoEl.checked = false;
    const prevCont = document.getElementById('whatsapp-preview-container');
    if (prevCont) prevCont.classList.add('hidden');
    const btnImp = document.getElementById('btn-import-whatsapp');
    if (btnImp) {
      btnImp.disabled = true;
      btnImp.textContent = 'Confirmar e Salvar Apostas';
    }
    comparacaoAtual = null;
    apostasDetectadas = [];
    abrirModal('modal-whatsapp');
  });

  document.getElementById('btn-configuracoes').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    const cota = ciclo.valorCota ?? 30.0;
    const taxa = (ciclo.taxaOrganizador !== undefined ? ciclo.taxaOrganizador : state.taxaOrganizadorGlobal) || 0.20;
    
    // Verifica se a quadra é dinâmica (padrão é dinâmico se premioQuadraDinamico !== false)
    let isDinamico = ciclo.premioQuadraDinamico !== false;
    const apostasPagas = (ciclo.apostas || []).filter(a => a.pago).length;
    const liquidoArrecadado = apostasPagas * cota * (1 - taxa);
    const quadraCalculada = Math.round(liquidoArrecadado * 0.10 * 100) / 100;

    // Se o ciclo possuía o antigo 240 artificial gravado mas as apostas pagas não justificam, força modo dinâmico
    if (ciclo.premioQuadra === 240 && apostasPagas < 100) {
      isDinamico = true;
      ciclo.premioQuadraDinamico = true;
      ciclo.premioQuadra = quadraCalculada;
    }

    let premioQuadraExibir = isDinamico ? quadraCalculada : (typeof ciclo.premioQuadra === 'number' ? ciclo.premioQuadra : 0.0);

    const elQuadraInput = document.getElementById('config-premio-quadra');
    const elQuadraDinamica = document.getElementById('config-quadra-dinamica');
    const elHint = document.getElementById('config-premio-quadra-hint');

    document.getElementById('config-nome').value = state.nomeBolao || '';
    document.getElementById('config-concurso-inicial').value = ciclo.concursoInicial ?? 3064;
    document.getElementById('config-valor-cota').value = cota;
    document.getElementById('config-taxa-organizador').value = Math.round(taxa * 100);
    elQuadraInput.value = premioQuadraExibir;

    if (elQuadraDinamica) {
      elQuadraDinamica.checked = isDinamico;
    }
    elQuadraInput.readOnly = isDinamico;

    if (elHint) {
      if (isDinamico) {
        elHint.textContent = `10% dinâmico do líquido de cotas pagas.`;
        elHint.title = `Modo Dinâmico: 10% do líquido arrecadado (Atualmente R$ ${quadraCalculada.toFixed(2).replace('.', ',')} com ${apostasPagas} cota(s) paga(s)).`;
      } else {
        elHint.textContent = 'Modo Manual: Prêmio fixo definido para a Quadra.';
        elHint.title = 'Modo Manual: Valor fixo estipulado.';
      }
    }

    if (document.getElementById('config-pix')) {
      const pixVal = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarChavePix(state.chavePix || '') : (state.chavePix || '');
      const elPix = document.getElementById('config-pix');
      elPix.value = pixVal;
      const badgePix = document.getElementById('badge-tipo-pix');
      if (badgePix && typeof MaskUtils !== 'undefined') {
        const tipo = MaskUtils.identificarTipoPix(pixVal);
        if (tipo === 'cpf') {
          badgePix.textContent = '📄 CPF';
          badgePix.style.color = '#10b981';
          badgePix.style.background = 'rgba(16, 185, 129, 0.15)';
          badgePix.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else if (tipo === 'celular') {
          badgePix.textContent = '📱 Celular';
          badgePix.style.color = '#60a5fa';
          badgePix.style.background = 'rgba(59, 130, 246, 0.15)';
          badgePix.style.borderColor = 'rgba(59, 130, 246, 0.3)';
        } else if (tipo === 'email') {
          badgePix.textContent = '✉️ E-mail';
          badgePix.style.color = '#a78bfa';
          badgePix.style.background = 'rgba(167, 139, 250, 0.15)';
          badgePix.style.borderColor = 'rgba(167, 139, 250, 0.3)';
        } else if (tipo === 'cnpj') {
          badgePix.textContent = '🏢 CNPJ';
          badgePix.style.color = '#f59e0b';
          badgePix.style.background = 'rgba(245, 158, 11, 0.15)';
          badgePix.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        } else if (tipo === 'aleatoria') {
          badgePix.textContent = '🔑 Aleatória';
          badgePix.style.color = '#ec4899';
          badgePix.style.background = 'rgba(236, 72, 153, 0.15)';
          badgePix.style.borderColor = 'rgba(236, 72, 153, 0.3)';
        } else {
          badgePix.textContent = '🔑 Chave PIX';
          badgePix.style.color = 'var(--text-muted)';
          badgePix.style.background = 'rgba(255, 255, 255, 0.05)';
          badgePix.style.borderColor = 'var(--border-color)';
        }
      }
    }
    if (document.getElementById('config-celular')) {
      document.getElementById('config-celular').value = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarTelefone(state.celularOrganizador || '') : (state.celularOrganizador || '');
    }
    if (document.getElementById('config-whatsapp-grupo')) {
      document.getElementById('config-whatsapp-grupo').value = state.linkGrupoWhatsApp || '';
    }
    if (document.getElementById('config-site-app')) {
      document.getElementById('config-site-app').value = state.urlSiteAcesso || '';
    }
    abrirModal('modal-config');
  });

  // Checkbox: Alternar Modo Dinâmico do Prêmio da Quadra
  document.getElementById('config-quadra-dinamica')?.addEventListener('change', (e) => {
    const ciclo = getCicloVisualizado();
    const cota = parseFloat(document.getElementById('config-valor-cota').value) || ciclo.valorCota || 30.0;
    const taxaInput = parseFloat(document.getElementById('config-taxa-organizador').value);
    const taxa = (!isNaN(taxaInput) && taxaInput >= 0 && taxaInput <= 100) ? (taxaInput / 100) : 0.20;
    const apostasPagas = (ciclo.apostas || []).filter(a => a.pago).length;
    const elQuadraInput = document.getElementById('config-premio-quadra');
    const elHint = document.getElementById('config-premio-quadra-hint');

    if (e.target.checked) {
      const liquido = apostasPagas * cota * (1 - taxa);
      const valor = Math.round(liquido * 0.10 * 100) / 100;
      elQuadraInput.value = valor;
      elQuadraInput.readOnly = true;
      if (elHint) {
        elHint.textContent = `10% dinâmico do líquido de cotas pagas.`;
        elHint.title = `Modo Dinâmico: 10% do líquido arrecadado (Atualmente R$ ${valor.toFixed(2).replace('.', ',')} com ${apostasPagas} cota(s) paga(s)).`;
      }
    } else {
      elQuadraInput.readOnly = false;
      elQuadraInput.focus();
      if (elHint) {
        elHint.textContent = 'Modo Manual: Prêmio fixo definido para a Quadra.';
        elHint.title = 'Modo Manual: Valor fixo estipulado.';
      }
    }
  });

  // Botão: Recalcular 10% do líquido no modal de configurações
  document.getElementById('btn-recalc-quadra-config')?.addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    const cota = parseFloat(document.getElementById('config-valor-cota').value) || ciclo.valorCota || 30.0;
    const taxaInput = parseFloat(document.getElementById('config-taxa-organizador').value);
    const taxa = (!isNaN(taxaInput) && taxaInput >= 0 && taxaInput <= 100) ? (taxaInput / 100) : 0.20;
    const apostasPagas = (ciclo.apostas || []).filter(a => a.pago).length;
    const valor = BolaoEngine.calcularPremioQuadraPadrao(apostasPagas, cota, taxa);
    
    const elQuadraInput = document.getElementById('config-premio-quadra');
    const elQuadraDinamica = document.getElementById('config-quadra-dinamica');
    const elHint = document.getElementById('config-premio-quadra-hint');

    elQuadraInput.value = valor;
    if (elQuadraDinamica) elQuadraDinamica.checked = true;
    elQuadraInput.readOnly = true;

    if (elHint) {
      elHint.textContent = `10% dinâmico do líquido de cotas pagas.`;
      elHint.title = `Modo Dinâmico: 10% do líquido arrecadado (Atualmente R$ ${valor.toFixed(2).replace('.', ',')} com ${apostasPagas} cota(s) paga(s)).`;
    }
    mostrarNotificacaoToast(`⚡ Prêmio da Quadra calculado (10% do líquido de ${apostasPagas} cota(s) paga(s)): R$ ${valor.toFixed(2).replace('.', ',')}`);
  });

  // Botão: Copiar apostas do ciclo anterior
  document.getElementById('btn-copiar-apostas-anterior')?.addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
      alert('🔒 As apostas desta edição já estão fechadas e travadas contra alterações.');
      return;
    }
    const cicloAnterior = getCicloAnterior();
    if (!cicloAnterior || !cicloAnterior.apostas || cicloAnterior.apostas.length === 0) {
      alert('Nenhuma edição anterior com apostas foi encontrada no histórico.');
      return;
    }
    const confirmou = confirm(
      `Deseja copiar as ${cicloAnterior.apostas.length.toLocaleString('pt-BR')} apostas da ${cicloAnterior.nome} para a ${ciclo.nome}?\n\n` +
      `• As apostas serão importadas com as dezenas originais e marcadas como aguardando confirmação (Pendente).\n` +
      `• Substituirá a lista de apostas atual da ${ciclo.nome}.`
    );
    if (!confirmou) return;

    ciclo.apostas = cicloAnterior.apostas.map(a => ({
      id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
      nome: a.nome,
      dezenas: [...a.dezenas],
      pago: false,
      confirmada: false,
      origem: 'mantida',
      observacao: `Copiada da ${cicloAnterior.nome}`,
      criadoEm: new Date().toISOString()
    }));

    salvarEstado();
    fecharModal('modal-config');
    renderApp();
    alert(`✅ ${ciclo.apostas.length.toLocaleString('pt-BR')} apostas da ${cicloAnterior.nome} copiadas com sucesso para a ${ciclo.nome}!`);
  });

  // Botão: Finalizar Apostas
  document.getElementById('btn-modal-finalizar-apostas').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    abrirModalFinalizarApostas(ciclo);
  });

  // Abas do Modal Finalizar Apostas
  document.querySelectorAll('.finalizar-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.finalizar-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabName = btn.getAttribute('data-tab');
      renderAbaFinalizar(tabName, gruposFinalizarAtual);
    });
  });

  // Botão: Confirmar Fechamento e Excluir Desistentes
  document.getElementById('btn-confirmar-fechamento-apostas').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    const desistentes = ciclo.apostas.filter(a => !(a.pago || a.confirmada));
    const confirmadas = ciclo.apostas.filter(a => a.pago || a.confirmada);

    if (confirmadas.length === 0) {
      alert('Nenhuma aposta foi confirmada ainda! Confirme pelo menos uma aposta antes de finalizar.');
      return;
    }

    const confirmou = confirm(
      `Deseja realmente finalizar as apostas da ${ciclo.nome}?\n\n` +
      `• ${confirmadas.length.toLocaleString('pt-BR')} aposta(s) confirmada(s) permanecerão no bolão.\n` +
      `• ${desistentes.length.toLocaleString('pt-BR')} aposta(s) não confirmada(s) serão EXCLUÍDAS desta edição e não passarão para as edições seguintes.`
    );

    if (!confirmou) return;

    // Guarda histórico de descartadas para auditoria
    ciclo.apostasDescartadas = desistentes;
    // Mantém estritamente as confirmadas no ciclo!
    ciclo.apostas = confirmadas;
    ciclo.faseApostas = 'fechada';
    ciclo.finalizadoApostasEm = new Date().toISOString();

    salvarEstado();
    fecharModal('modal-finalizar-apostas');
    renderApp();

    alert(`🎉 Apostas da ${ciclo.nome} finalizadas com sucesso!\nO bolão foi fechado com ${confirmadas.length.toLocaleString('pt-BR')} apostas ativas prontas para apuração.`);
  });

  document.getElementById('btn-manual-sorteio').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    document.getElementById('form-sorteio').reset();
    let proximoNum = ciclo.concursoInicial;
    if (ciclo.concursos.length > 0) {
      proximoNum = ciclo.concursos[ciclo.concursos.length - 1].numero + 1;
    }
    document.getElementById('sorteio-numero').value = proximoNum;
    abrirModal('modal-sorteio');
  });

  document.getElementById('btn-sync-caixa').addEventListener('click', sincronizarProximoConcursoCaixa);

  // Form: Salvar Aposta Individual
  document.getElementById('form-aposta').addEventListener('submit', (e) => {
    e.preventDefault();
    const ciclo = getCicloVisualizado();
    if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
      alert('🔒 Ação bloqueada: As apostas desta edição já estão fechadas! Conforme as regras, nenhuma aposta pode ser adicionada ou alterada.');
      fecharModal('modal-aposta');
      return;
    }
    const id = document.getElementById('aposta-id').value;
    const nome = document.getElementById('aposta-nome').value.trim();
    const pago = document.getElementById('aposta-pago').value === 'true';
    const observacao = document.getElementById('aposta-telefone').value.trim();

    const inputs = document.querySelectorAll('#form-aposta .num-input');
    const dezenas = [];
    const invalidos = [];
    const repetidos = [];

    inputs.forEach(inp => {
      const raw = inp.value.trim();
      if (!raw) return;
      const val = parseInt(raw, 10);
      if (isNaN(val) || val < 1 || val > 60 || raw === '0' || raw === '00') {
        invalidos.push(raw);
      } else {
        if (dezenas.includes(val)) {
          repetidos.push(val < 10 ? `0${val}` : `${val}`);
        } else {
          dezenas.push(val);
        }
      }
    });

    if (invalidos.length > 0) {
      alert(`⚠️ Número(s) não permitido(s): ${invalidos.join(', ')}.\n\nNo SenaClube, todos os números dos jogos aceitam exclusivamente valores no intervalo de 01 a 60!`);
      return;
    }

    if (repetidos.length > 0) {
      alert(`⚠️ Número(s) repetido(s) detectado(s): ${repetidos.join(', ')}.\n\nCada aposta deve conter 6 dezenas distintas.`);
      return;
    }

    if (dezenas.length !== 6) {
      alert('⚠️ Preencha todas as 6 dezenas da aposta com números válidos de 01 a 60.');
      return;
    }

    dezenas.sort((a, b) => a - b);
    const dezenasFormatadas = dezenas.map(d => d < 10 ? `0${d}` : `${d}`);

    if (id) {
      const aposta = ciclo.apostas.find(a => a.id === id);
      if (aposta) {
        aposta.nome = nome;
        aposta.dezenas = dezenasFormatadas;
        aposta.pago = pago;
        aposta.observacao = observacao;
      }
    } else {
      ciclo.apostas.unshift({
        id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        nome,
        dezenas: dezenasFormatadas,
        pago,
        observacao,
        criadoEm: new Date().toISOString()
      });
    }

    salvarEstado();
    fecharModal('modal-aposta');
    renderApp();
  });

  // WhatsApp Parser & Comparador Inteligente
  let apostasDetectadas = [];
  let comparacaoAtual = null;

  document.getElementById('btn-preview-whatsapp').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    const rawText = document.getElementById('whatsapp-raw-text').value;
    const defaultPago = document.getElementById('whatsapp-default-pago').checked;

    apostasDetectadas = WhatsAppParser.parse(rawText, defaultPago);

    const container = document.getElementById('whatsapp-preview-container');
    const summaryBar = document.getElementById('comparison-summary-bar');
    const list = document.getElementById('whatsapp-preview-list');
    const btnImport = document.getElementById('btn-import-whatsapp');

    list.innerHTML = '';
    summaryBar.innerHTML = '';

    // Aviso se houver números fora do intervalo de 1 a 60
    if (apostasDetectadas.numerosInvalidos && apostasDetectadas.numerosInvalidos.length > 0) {
      alert(`⚠️ Número(s) não permitido(s) encontrado(s) no texto:\n\n${apostasDetectadas.numerosInvalidos.join(', ')}\n\nNo SenaClube, não é permitido utilizar números fora do intervalo de 01 a 60! Esses números foram desconsiderados na leitura das apostas.`);
    }

    if (apostasDetectadas.length === 0) {
      const avisoInvalido = (apostasDetectadas.numerosInvalidos && apostasDetectadas.numerosInvalidos.length > 0)
        ? `<div style="margin-top: 8px; color: #ef4444; font-weight: 600;">⚠️ Atenção: Os seguintes números não são permitidos por estarem fora do intervalo de 01 a 60: ${apostasDetectadas.numerosInvalidos.join(', ')}</div>`
        : '';
      list.innerHTML = `<p style="color: #f87171; font-size: 0.85rem; padding: 10px;">Nenhuma aposta com 6 dezenas válidas (01 a 60) foi encontrada no texto.${avisoInvalido}</p>`;
      btnImport.disabled = true;
      btnImport.textContent = 'Confirmar e Salvar Apostas';
      container.classList.remove('hidden');
      return;
    }

    // Compara com as apostas existentes no ciclo atual para evitar QUALQUER duplicação
    comparacaoAtual = BolaoEngine.compararComCicloAnterior(ciclo.apostas, apostasDetectadas);

    summaryBar.innerHTML = `
      <span class="comp-badge mantidas" title="Jogos que já constam no bolão exatamente com essas dezenas">
        ✅ ${comparacaoAtual.totalMantidas} Mantido(s)
      </span>
      ${comparacaoAtual.totalAlteradas > 0 ? `
        <span class="comp-badge alteradas" title="Participantes existentes que alteraram os números">
          🔄 ${comparacaoAtual.totalAlteradas} Alterado(s)
        </span>` : ''}
      ${comparacaoAtual.totalNovas > 0 ? `
        <span class="comp-badge adicionadas" title="Novos participantes a serem incluídos">
          🆕 ${comparacaoAtual.totalNovas} Novo(s)
        </span>` : ''}
      ${apostasDetectadas.numerosInvalidos && apostasDetectadas.numerosInvalidos.length > 0 ? `
        <span class="comp-badge desistentes" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444;" title="Números fora do intervalo de 01 a 60 desconsiderados">
          ⚠️ ${apostasDetectadas.numerosInvalidos.length} fora de 01 a 60 (${apostasDetectadas.numerosInvalidos.join(', ')})
        </span>` : ''}
      <span class="comp-badge nao-renovadas" title="Demais jogos já cadastrados no bolão">
        ⚠️ ${comparacaoAtual.totalNaoRenovadas} Demais no Bolão
      </span>
    `;

    // Renderiza cada item detectado com a indicação exata da ação
    // 1. Mantidas
    comparacaoAtual.mantidas.forEach(a => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const statusLabel = defaultPago
        ? '<span class="comp-badge mantidas" style="font-size: 0.68rem;">✅ Mantida (Atualizar para PAGO)</span>'
        : '<span class="comp-badge mantidas" style="font-size: 0.68rem;">✅ Mantida (Já Cadastrada)</span>';

      item.innerHTML = `
        <div class="preview-item-left">
          ${statusLabel}
          <strong>${escapeHTML(a.nome)}</strong>
        </div>
        <div class="dezenas-preview">
          ${a.dezenas.map(d => `<span class="preview-num">${d}</span>`).join('')}
        </div>
      `;
      list.appendChild(item);
    });

    // 2. Alteradas
    comparacaoAtual.alteradas.forEach(a => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const statusLabel = defaultPago
        ? '<span class="comp-badge alteradas" style="font-size: 0.68rem;">🔄 Alterada (Atualizar para PAGO)</span>'
        : '<span class="comp-badge alteradas" style="font-size: 0.68rem;">🔄 Dezenas Alteradas</span>';

      item.innerHTML = `
        <div class="preview-item-left">
          ${statusLabel}
          <strong>${escapeHTML(a.nome)}</strong>
        </div>
        <div class="dezenas-preview">
          ${a.dezenas.map(d => `<span class="preview-num">${d}</span>`).join('')}
        </div>
      `;
      list.appendChild(item);
    });

    // 3. Novas
    comparacaoAtual.novas.forEach(a => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const statusLabel = defaultPago
        ? '<span class="comp-badge adicionadas" style="font-size: 0.68rem;">🆕 Nova Aposta (PAGA)</span>'
        : '<span class="comp-badge adicionadas" style="font-size: 0.68rem;">🆕 Nova Aposta (Aguardando Pagamento)</span>';

      item.innerHTML = `
        <div class="preview-item-left">
          ${statusLabel}
          <strong>${escapeHTML(a.nome)}</strong>
        </div>
        <div class="dezenas-preview">
          ${a.dezenas.map(d => `<span class="preview-num">${d}</span>`).join('')}
        </div>
      `;
      list.appendChild(item);
    });

    btnImport.disabled = false;
    container.classList.remove('hidden');

    // Ajusta o texto do botão de acordo com a ação a ser realizada
    if (comparacaoAtual.totalNovas === 0 && comparacaoAtual.totalAlteradas === 0) {
      if (defaultPago) {
        btnImport.innerHTML = `✅ Confirmar Pagamento (${comparacaoAtual.totalMantidas} mantida(s))`;
      } else {
        btnImport.innerHTML = '✅ Confirmar (Manter sem alterar pagamentos)';
      }
    } else {
      btnImport.innerHTML = defaultPago
        ? 'Confirmar e Salvar Apostas (Pagas)'
        : 'Confirmar e Salvar Apostas (Aguardando Pagamento)';
    }
  });

  // Atualiza dinamicamente a pré-visualização se o usuário alternar o checkbox de Pagas
  const chkDefaultPago = document.getElementById('whatsapp-default-pago');
  if (chkDefaultPago) {
    chkDefaultPago.addEventListener('change', () => {
      const prevCont = document.getElementById('whatsapp-preview-container');
      if (comparacaoAtual && prevCont && !prevCont.classList.contains('hidden')) {
        document.getElementById('btn-preview-whatsapp').click();
      }
    });
  }

  // Ação ao Confirmar e Salvar Apostas do WhatsApp
  document.getElementById('btn-import-whatsapp').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
      alert('🔒 Ação bloqueada: As apostas deste ciclo já estão fechadas! Conforme as regras, nenhuma aposta pode ser importada ou alterada.');
      fecharModal('modal-whatsapp');
      return;
    }
    const defaultPago = document.getElementById('whatsapp-default-pago').checked;

    if (!comparacaoAtual) {
      alert('Nenhuma aposta analisada.');
      return;
    }

    let mantidasAtualizadas = 0;
    let alteradasAtualizadas = 0;
    let novasAdicionadas = 0;

    // 1. Processa Mantidas (JAMAIS cria aposta duplicada!)
    comparacaoAtual.mantidas.forEach(m => {
      const apostaExistente = ciclo.apostas.find(a => a.id === m.apostaExistenteId);
      if (apostaExistente) {
        apostaExistente.origem = 'mantida';
        if (defaultPago) {
          apostaExistente.pago = true;
          apostaExistente.confirmada = true;
        }
        mantidasAtualizadas++;
      }
    });

    // 2. Processa Alteradas (Atualiza as dezenas e pagamento da aposta existente)
    comparacaoAtual.alteradas.forEach(alt => {
      const apostaExistente = ciclo.apostas.find(a => a.id === alt.apostaExistenteId);
      if (apostaExistente) {
        apostaExistente.dezenas = [...alt.dezenas];
        apostaExistente.observacao = 'Dezenas alteradas via WhatsApp';
        apostaExistente.origem = 'alterada';
        if (defaultPago) {
          apostaExistente.pago = true;
          apostaExistente.confirmada = true;
        }
        alteradasAtualizadas++;
      }
    });

    // 3. Processa Novas (Apenas participantes que não existiam são adicionados)
    comparacaoAtual.novas.forEach(nova => {
      ciclo.apostas.unshift({
        id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        nome: nova.nome,
        dezenas: [...nova.dezenas],
        pago: !!defaultPago,
        confirmada: !!defaultPago,
        origem: 'nova',
        observacao: 'Adicionada via WhatsApp',
        criadoEm: new Date().toISOString()
      });
      novasAdicionadas++;
    });

    salvarEstado();
    fecharModal('modal-whatsapp');
    renderApp();

    let detalhesMsg = '';
    if (mantidasAtualizadas > 0) {
      detalhesMsg += `• ${mantidasAtualizadas} aposta(s) já existente(s) mantida(s)${defaultPago ? ' e marcada(s) como PAGA(S)' : ''} (sem duplicar).\n`;
    }
    if (alteradasAtualizadas > 0) {
      detalhesMsg += `• ${alteradasAtualizadas} aposta(s) existente(s) tiveram seus números alterados${defaultPago ? ' e marcada(s) como PAGA(S)' : ''}.\n`;
    }
    if (novasAdicionadas > 0) {
      detalhesMsg += `• ${novasAdicionadas} nova(s) aposta(s) adicionada(s) ao bolão${defaultPago ? ' e marcada(s) como PAGA(S)' : ' (Aguardando pagamento)'}.\n`;
    }

    alert(`🎉 Processamento concluído com sucesso!\n\n${detalhesMsg}`);
  });

  // Form: Inserir Sorteio Manual
  document.getElementById('form-sorteio').addEventListener('submit', (e) => {
    e.preventDefault();
    const ciclo = getCicloVisualizado();
    if (ciclo.status === 'finalizado') {
      alert(`A ${ciclo.nome} já foi encerrada porque a Sena foi premiada!\nInicie a próxima edição para continuar a apuração.`);
      return;
    }
    const numero = parseInt(document.getElementById('sorteio-numero').value, 10);
    const dataApuracao = document.getElementById('sorteio-data').value.trim() || new Date().toLocaleDateString('pt-BR');

    const inputs = document.querySelectorAll('#form-sorteio .num-sorteio-input');
    const dezenas = [];
    const invalidos = [];
    const repetidos = [];

    inputs.forEach(inp => {
      const raw = inp.value.trim();
      if (!raw) return;
      const val = parseInt(raw, 10);
      if (isNaN(val) || val < 1 || val > 60 || raw === '0' || raw === '00') {
        invalidos.push(raw);
      } else {
        if (dezenas.includes(val)) {
          repetidos.push(val < 10 ? `0${val}` : `${val}`);
        } else {
          dezenas.push(val);
        }
      }
    });

    if (invalidos.length > 0) {
      alert(`⚠️ Número(s) não permitido(s): ${invalidos.join(', ')}.\n\nNo SenaClube, os sorteios aceitam exclusivamente valores no intervalo de 01 a 60!`);
      return;
    }

    if (repetidos.length > 0) {
      alert(`⚠️ Número(s) repetido(s) no sorteio: ${repetidos.join(', ')}.\n\nO concurso deve conter 6 dezenas distintas.`);
      return;
    }

    if (dezenas.length !== 6) {
      alert('⚠️ Preencha todas as 6 dezenas do sorteio com números válidos de 01 a 60.');
      return;
    }

    dezenas.sort((a, b) => a - b);
    const dezenasFormatadas = dezenas.map(d => d < 10 ? `0${d}` : `${d}`);

    const jaExiste = ciclo.concursos.find(c => c.numero === numero);
    if (jaExiste) {
      alert(`O concurso ${numero} já está na edição!`);
      return;
    }

    ciclo.concursos.push({
      numero,
      dataApuracao,
      dezenas: dezenasFormatadas
    });

    ciclo.concursos.sort((a, b) => a.numero - b.numero);

    salvarEstado();
    fecharModal('modal-sorteio');
    renderApp();

    if (ciclo.status === 'finalizado') {
      mostrarNotificacaoToast(`🏆 Concurso ${numero} apurado: Ganhador(es) da Sena identificado(s)! Edição encerrada.`);
    } else {
      mostrarNotificacaoToast(`✅ Concurso ${numero} inserido e apurado na ${ciclo.nome}!`);
    }
  });

  // Form: Configurações do Bolão (com campo Prêmio da Quadra)
  document.getElementById('form-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-salvar-config') || e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit ? btnSubmit.innerHTML : 'Salvar Configurações';
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '⏳ Salvando...';
    }

    try {
      const ciclo = getCicloVisualizado();
      state.nomeBolao = document.getElementById('config-nome').value.trim();
      ciclo.concursoInicial = parseInt(document.getElementById('config-concurso-inicial').value, 10) || 3058;
      ciclo.valorCota = parseFloat(document.getElementById('config-valor-cota').value) || 24.0;
      
      const taxaInput = parseFloat(document.getElementById('config-taxa-organizador').value);
      ciclo.taxaOrganizador = (taxaInput >= 0 && taxaInput <= 100) ? (taxaInput / 100) : 0.20;
      state.taxaOrganizadorGlobal = ciclo.taxaOrganizador;

      // Prêmio da Quadra
      const elQuadraDinamica = document.getElementById('config-quadra-dinamica');
      const isDinamico = elQuadraDinamica ? elQuadraDinamica.checked : true;
      ciclo.premioQuadraDinamico = isDinamico;

      if (isDinamico) {
        const apostasPagas = (ciclo.apostas || []).filter(a => a.pago).length;
        const liquido = apostasPagas * ciclo.valorCota * (1 - ciclo.taxaOrganizador);
        ciclo.premioQuadra = Math.round(liquido * 0.10 * 100) / 100;
      } else {
        ciclo.premioQuadra = parseFloat(document.getElementById('config-premio-quadra').value) || 0.0;
      }

      // Contatos, PIX e Links (salva com máscara canônica)
      const pixInput = document.getElementById('config-pix');
      if (pixInput) {
        state.chavePix = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarChavePix(pixInput.value.trim()) : pixInput.value.trim();
      }

      const celInput = document.getElementById('config-celular');
      if (celInput) {
        state.celularOrganizador = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarTelefone(celInput.value.trim()) : celInput.value.trim();
      }

      const grupoInput = document.getElementById('config-whatsapp-grupo');
      if (grupoInput) state.linkGrupoWhatsApp = grupoInput.value.trim();

      const siteInput = document.getElementById('config-site-app');
      if (siteInput) state.urlSiteAcesso = siteInput.value.trim();

      const salvou = await salvarEstado();
      fecharModal('modal-config');
      renderApp();

      if (salvou) {
        mostrarNotificacaoToast('✅ Configurações salvas com sucesso!');
      } else {
        alert('⚠️ Houve uma falha ao sincronizar com o servidor local. Os dados foram aplicados na tela.');
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    }
  });

  // Botão: Zerar Sorteios
  document.getElementById('btn-zerar-ciclo').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    if (confirm(`Tem certeza que deseja zerar os sorteios da ${ciclo.nome}? As apostas e participantes serão MANTIDOS.`)) {
      ciclo.concursos = [];
      ciclo.alertasExibidos = { quadraCicloId: null, senaCicloId: null };
      ciclo.ganhadorSenaNome = null;
      ciclo.ganhadorQuadraNome = null;
      ciclo.status = 'ativo';
      ciclo.finalizadoEm = null;
      salvarEstado();
      fecharModal('modal-config');
      renderApp();
      alert(`Sorteios da ${ciclo.nome} reiniciados com sucesso!`);
    }
  });

  // Botão: Excluir Todas as Apostas
  document.getElementById('btn-excluir-todas-apostas').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    if (ciclo.faseApostas === 'fechada' || ciclo.status === 'finalizado') {
      alert('🔒 Ação bloqueada: As apostas desta edição já estão fechadas e protegidas contra exclusão.');
      return;
    }
    const totalApostas = (ciclo.apostas || []).length;

    if (totalApostas === 0) {
      alert(`A ${ciclo.nome} já não possui nenhuma aposta cadastrada.`);
      return;
    }

    const confirmou = confirm(
      `⚠️ ATENÇÃO: Deseja realmente EXCLUIR TODAS as ${totalApostas.toLocaleString('pt-BR')} apostas da ${ciclo.nome}?\n\n` +
      `• Todas as cotas e participantes desta edição serão apagados permanentemente.\n` +
      `• Os sorteios já apurados (${ciclo.concursos.length}) serão preservados.\n\n` +
      `Tem certeza absoluta que deseja prosseguir?`
    );

    if (!confirmou) return;

    ciclo.apostas = [];
    ciclo.apostasDescartadas = [];
    state.paginaAtual = 1;

    salvarEstado();
    fecharModal('modal-config');
    renderApp();

    alert(`🗑️ Todas as apostas da ${ciclo.nome} foram excluídas com sucesso!`);
  });

  // Botão: Excluir Ciclo Atual (via Configurações)
  document.getElementById('btn-excluir-ciclo-atual').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    excluirCicloPorId(ciclo.id);
  });

  // Modal Relatório & Central de Mensagens WhatsApp
  function getNomeAbaWhatsApp(tabKey) {
    const nomes = {
      'boletim': 'Boletim de Apuração',
      'abertura-padrao': 'Abertura de Novo Bolão',
      'lembrete-fechamento': 'Lembrete de Encerramento',
      'convite-completo': 'Convite Explicativo',
      'convite-rapido': 'Convite Rápido'
    };
    return nomes[tabKey] || 'Mensagem';
  }

  // Função Central: Aplica parâmetros dinâmicos (datas, hora, concurso, edição, nome do bolão, pix)
  // e formata com espaçamento visual arejado qualquer texto (padrão ou customizado)
  function aplicarParametrosDinamicosNoTexto(textoOriginal, params = {}) {
    if (!textoOriginal || typeof textoOriginal !== 'string') return '';
    let texto = textoOriginal;

    const nomeBolao = (params.nomeBolao || state.nomeBolao || 'Bolão dos amigos').trim();
    const cicloNome = (params.cicloNome || 'Edição 1').replace(/Ciclo\s*/i, 'Edição ');
    const concursoInicial = String(params.concursoInicial || '3064');
    const dataInicio = params.dataInicio || 'Terça-feira (29/09)';
    const dataEncerramento = params.dataEncerramento || 'Segunda-feira (28/09) até as 20h';
    const chavePix = (params.chavePix !== undefined ? params.chavePix : (state.chavePix || '')).trim();
    const valorCota = params.valorCota ? (typeof params.valorCota === 'number' ? `R$ ${params.valorCota.toFixed(2).replace('.', ',')}` : params.valorCota) : 'R$ 30,00';

    // 1. Limpeza estrita de qualquer menção legada a "WM" ou resíduos
    texto = texto.replace(/BOLÃO\s+WM\s+ENTRE\s+AMIGOS\s*(?:—|-)?\s*SENACLUBE/gi, nomeBolao.toUpperCase());
    texto = texto.replace(/BOLÃO\s+WM\s+ENTRE\s+AMIGOS/gi, nomeBolao.toUpperCase());
    texto = texto.replace(/Bolão WM entre amigos/gi, nomeBolao);
    texto = texto.replace(/\bWM\b/g, '').replace(/\s{2,}/g, ' ');

    // 2. Remove emojis corrompidos ou fragmentados
    texto = texto.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

    // 3. Função auxiliar para substituir e DEDUPLICAR qualquer campo (garante no máximo 1 ocorrência limpa)
    const replaceAndDedup = (source, regexPattern, singleReplacement) => {
      let replaced = false;
      return source.replace(regexPattern, () => {
        if (!replaced) {
          replaced = true;
          return singleReplacement;
        }
        return ''; // Elimina qualquer duplicata subsequente
      });
    };

    // Cabeçalho oficial: 🏆 *NOME DO BOLÃO — EDIÇÃO X*
    texto = replaceAndDedup(
      texto,
      /(?:🏆\s*)?\*[^\n*]+?\s*—\s*(?:EDIÇÃO|Ciclo|Edição)\s*\d+\*[^\n]*\n*/gi,
      `🏆 *${nomeBolao.toUpperCase()} — ${cicloNome.toUpperCase()}*\n\n`
    );

    // Concurso Inicial (Deduplica se houver múltiplas ocorrências)
    texto = replaceAndDedup(
      texto,
      /(?:[^\n]*\*Concurso Inicial:\*[^\n]*\n*)+/gi,
      `📌 *Concurso Inicial:* ${concursoInicial}\n\n`
    );

    // Primeiro Sorteio (Deduplica se houver múltiplas ocorrências)
    texto = replaceAndDedup(
      texto,
      /(?:[^\n]*\*(?:Primeiro|1º)\s*Sorteio:\*[^\n]*\n*)+/gi,
      `🗓️ *Primeiro Sorteio:* ${dataInicio}\n\n`
    );

    // Prazo Limite (Deduplica se houver múltiplas ocorrências)
    texto = replaceAndDedup(
      texto,
      /(?:[^\n]*\*(?:Prazo Limite(?: para Apostas)?|Prazo Final(?: Impreterível)?|Encerramento(?:\s*das\s*Apostas)?):\*[^\n]*\n*)+/gi,
      `⏰ *Prazo Limite para Apostas:* ${dataEncerramento}\n\n`
    );

    // Valor da Cota (Deduplica se houver múltiplas ocorrências)
    texto = replaceAndDedup(
      texto,
      /(?:[^\n]*\*Valor(?: por Jogo\/Cota| da Cota):\*[^\n]*\n*)+/gi,
      `💰 *Valor por Jogo/Cota:* ${valorCota}\n\n`
    );

    // Chave Pix (Deduplica se houver múltiplas ocorrências)
    if (chavePix) {
      if (/(?:[^\n]*\*(?:Chave\s*)?Pix:\*[^\n]*\n*)/i.test(texto)) {
        texto = replaceAndDedup(
          texto,
          /(?:[^\n]*\*(?:Chave\s*)?Pix:\*[^\n]*\n*)+/gi,
          `🔑 *Chave Pix:* ${chavePix}\n\n`
        );
      } else {
        const regexAntesRegras = /(\n*📝\s*\*COMO PARTICIPAR:\*)/i;
        if (regexAntesRegras.test(texto)) {
          texto = texto.replace(regexAntesRegras, `\n\n🔑 *Chave Pix:* ${chavePix}\n\n$1`);
        } else {
          texto += `\n\n🔑 *Chave Pix:* ${chavePix}\n\n`;
        }
      }
    } else {
      texto = texto.replace(/(?:[^\n]*\*(?:Chave\s*)?Pix:\*[^\n]*\n*)+/gi, '');
    }

    // Como Participar (Deduplica)
    texto = replaceAndDedup(
      texto,
      /(?:[^\n]*\*COMO PARTICIPAR(?::\*)?[^\n]*\n*)+/gi,
      `📝 *COMO PARTICIPAR:*\n\n`
    );

    // Passos 1, 2, 3 (Deduplica)
    texto = replaceAndDedup(
      texto,
      /(?:1️⃣[^\n]*\n*)+/gi,
      `1️⃣ Envie suas 6 dezenas no privado para mim, ou confirme que mantém seu jogo anterior.\n\n`
    );
    texto = replaceAndDedup(
      texto,
      /(?:2️⃣[^\n]*\n*)+/gi,
      `2️⃣ Realize o Pix da sua cota e envie o comprovante.\n\n`
    );
    texto = replaceAndDedup(
      texto,
      /(?:3️⃣[^\n]*(?:\s*d\b)?\n*)+/gi,
      `3️⃣ Após o prazo, o sistema travará as apostas e nenhum jogo poderá ser alterado!\n\n`
    );

    // Divisores horizontais colados ou repetidos
    texto = texto.replace(/(?:\s*━{5,}\s*){2,}/g, '\n\n━━━━━━━━━━━━━━━━━━━━━\n\n');

    // Mensagem de encerramento / Boa sorte
    texto = replaceAndDedup(
      texto,
      /(?:[^\n]*Boa sorte a todos[^\n]*\n*)+/gi,
      `Boa sorte a todos, vamos buscar essa Sena juntos! 💰🚀\n\n`
    );

    // Placeholders flexíveis {{...}}
    texto = texto
      .replace(/\{\{nomeBolao\}\}/gi, nomeBolao)
      .replace(/\{\{cicloNome\}\}/gi, cicloNome)
      .replace(/\{\{concursoInicial\}\}/gi, concursoInicial)
      .replace(/\{\{dataInicio\}\}/gi, dataInicio)
      .replace(/\{\{dataEncerramento\}\}/gi, dataEncerramento)
      .replace(/\{\{chavePix\}\}/gi, chavePix);

    // Normalização final de quebras de linha
    texto = texto.replace(/\n{3,}/g, '\n\n').trim();

    return texto;
  }

  function atualizarBadgeStatusMensagem(status, horaSalvamento = null) {
    const badge = document.getElementById('badge-msg-custom-status');
    if (!badge) return;

    if (status === 'customizado') {
      const horaTexto = horaSalvamento ? ` às ${horaSalvamento}` : '';
      badge.innerHTML = `💾 Modelo Padrão Salvo${horaTexto}`;
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#10b981';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.5)';
    } else if (status === 'editado') {
      badge.innerHTML = '✏️ Alterações Não Salvas (Clique em "Salvar")';
      badge.style.background = 'rgba(245, 158, 11, 0.2)';
      badge.style.color = '#f59e0b';
      badge.style.borderColor = 'rgba(245, 158, 11, 0.5)';
    } else {
      badge.innerHTML = '✨ Modelo Ativo';
      badge.style.background = 'rgba(59, 130, 246, 0.15)';
      badge.style.color = '#60a5fa';
      badge.style.borderColor = 'rgba(59, 130, 246, 0.3)';
    }
  }

  function atualizarTextoMensagemWhatsApp(forcarRegeneracao = false) {
    const tabAtual = state.abaMensagemWhatsAppAtiva || 'boletim';
    const ciclo = getCicloVisualizado();
    const apuracao = BolaoEngine.apurar(ciclo.apostas, ciclo.concursos);
    const taxa = typeof ciclo.taxaOrganizador === 'number' ? ciclo.taxaOrganizador : state.taxaOrganizadorGlobal;
    const isDinamico = ciclo.premioQuadraDinamico !== false;
    const premioQuadra = typeof ciclo.premioQuadra === 'number' ? ciclo.premioQuadra : 0.0;
    const quadraPremiada = apuracao.ganhadoresQuadraPrimeiroSorteio && apuracao.ganhadoresQuadraPrimeiroSorteio.length > 0;
    const financeiro = BolaoEngine.calcularFinanceiro(ciclo.apostas, ciclo.valorCota, taxa, premioQuadra, quadraPremiada, isDinamico);

    const txtArea = document.getElementById('relatorio-whatsapp-text');
    const panelParams = document.getElementById('msg-custom-params');
    const descEl = document.getElementById('msg-tab-desc');

    inicializarDatasParametrosMensagem();

    const valDateInicio = document.getElementById('msg-param-inicio-date')?.value;
    const valDateEncerramento = document.getElementById('msg-param-encerramento-date')?.value;
    const valHoraEncerramento = document.getElementById('msg-param-encerramento-time')?.value || '20:00';

    const dataInicio = formatarDataSorteioExtenso(valDateInicio);
    const dataEncerramento = formatarDataEncerramentoExtenso(valDateEncerramento, valHoraEncerramento);

    // Atualiza badges visuais com o formato amigável gerado
    const badgeInicio = document.getElementById('badge-preview-inicio');
    if (badgeInicio) badgeInicio.textContent = dataInicio;

    const badgeEncerramento = document.getElementById('badge-preview-encerramento');
    if (badgeEncerramento) badgeEncerramento.textContent = dataEncerramento;

    const chavePix = (document.getElementById('msg-param-pix')?.value || '').trim();

    // Atualiza visibilidade dos campos de parâmetros e descrições
    if (tabAtual === 'boletim') {
      if (panelParams) panelParams.classList.add('hidden');
      if (descEl) descEl.textContent = 'Texto já formatado com o ranking de acertos, premiação líquida da Sena e da Quadra (sem arrecadação bruta ou taxas).';
    } else if (tabAtual === 'abertura-padrao') {
      if (panelParams) panelParams.classList.remove('hidden');
      if (descEl) descEl.textContent = 'Modelo vibrante e direto para anunciar que as inscrições do novo bolão estão oficialmente abertas.';
    } else if (tabAtual === 'lembrete-fechamento') {
      if (panelParams) panelParams.classList.remove('hidden');
      if (descEl) descEl.textContent = 'Lembrete de contagem regressiva avisando sobre o encerramento do prazo e o travamento das apostas.';
    } else if (tabAtual === 'convite-completo') {
      if (panelParams) panelParams.classList.add('hidden');
      if (descEl) descEl.textContent = 'Convite completo e didático ideal para apresentar o bolão a novos amigos e explicar as regras passo a passo.';
    } else if (tabAtual === 'convite-rapido') {
      if (panelParams) panelParams.classList.add('hidden');
      if (descEl) descEl.textContent = 'Convite curto e direto ao ponto com foco em engajamento rápido para amigos no WhatsApp.';
    }

    const dynamicParams = {
      nomeBolao: state.nomeBolao || 'Bolão dos amigos',
      cicloNome: ciclo.nome || 'Edição 1',
      concursoInicial: ciclo.concursoInicial || 3064,
      dataInicio,
      dataEncerramento,
      valorCota: ciclo.valorCota || 30.0,
      chavePix,
      premioQuadra: ciclo.premioQuadraDinamico !== false ? financeiro.premioQuadraConfig : (ciclo.premioQuadra || 0.0),
      premioQuadraDinamico: ciclo.premioQuadraDinamico !== false
    };

    // Se o usuário já salvou um modelo personalizado para esta aba e não solicitou restauração, usa o salvo
    const hasCustom = state.textosWhatsAppCustomizados && typeof state.textosWhatsAppCustomizados[tabAtual] === 'string' && state.textosWhatsAppCustomizados[tabAtual].trim() !== '';

    if (hasCustom && !forcarRegeneracao) {
      let textoSalvo = state.textosWhatsAppCustomizados[tabAtual];
      textoSalvo = aplicarParametrosDinamicosNoTexto(textoSalvo, dynamicParams);
      if (txtArea) txtArea.value = textoSalvo;
      atualizarBadgeStatusMensagem('customizado');
      return;
    }

    // Caso automático (ou restauração):
    atualizarBadgeStatusMensagem('automatico');

    if (tabAtual === 'boletim') {
      txtArea.value = ExportShare.gerarRelatorioWhatsApp(state, apuracao, financeiro, ciclo);
    } else if (tabAtual === 'abertura-padrao') {
      txtArea.value = ExportShare.gerarMensagemAberturaPadrao(dynamicParams);
    } else if (tabAtual === 'lembrete-fechamento') {
      txtArea.value = ExportShare.gerarMensagemLembreteFechamento({
        nomeBolao: dynamicParams.nomeBolao,
        dataEncerramento,
        chavePix
      });
    } else if (tabAtual === 'convite-completo') {
      txtArea.value = ExportShare.gerarMensagemConviteCompleto({
        nomeBolao: state.nomeBolao || 'Bolão dos amigos',
        valorCota: ciclo.valorCota || 30.0,
        whatsapp: state.celularOrganizador || '(61) 99627-2630',
        whatsappLink: `https://wa.me/55${(state.celularOrganizador || '61996272630').replace(/\D/g, '')}`,
        linkApp: state.urlSiteAcesso || 'https://sena-clube.vercel.app',
        linkGrupoWhatsApp: state.linkGrupoWhatsApp || 'https://chat.whatsapp.com/KT4gbhyKUUrBqW9fU2ZGpv'
      });
    } else if (tabAtual === 'convite-rapido') {
      txtArea.value = ExportShare.gerarMensagemConviteRapido({
        nomeBolao: state.nomeBolao || 'Bolão dos amigos',
        valorCota: ciclo.valorCota || 30.0,
        whatsapp: state.celularOrganizador || '(61) 99627-2630',
        whatsappLink: `https://wa.me/55${(state.celularOrganizador || '61996272630').replace(/\D/g, '')}`,
        linkApp: state.urlSiteAcesso || 'https://sena-clube.vercel.app',
        linkGrupoWhatsApp: state.linkGrupoWhatsApp || 'https://chat.whatsapp.com/KT4gbhyKUUrBqW9fU2ZGpv'
      });
    }
  }

  // Funções auxiliares para formatação de datas dos comunicados
  function formatarDataSorteioExtenso(dateString) {
    if (!dateString) return 'A definir';
    const partes = dateString.split('-');
    if (partes.length !== 3) return dateString;
    const ano = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    const dia = parseInt(partes[2], 10);
    const dataObj = new Date(ano, mes - 1, dia, 12, 0, 0);
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const diaSemana = diasSemana[dataObj.getDay()];
    const diaStr = String(dia).padStart(2, '0');
    const mesStr = String(mes).padStart(2, '0');
    return `${diaSemana} (${diaStr}/${mesStr})`;
  }

  function formatarDataEncerramentoExtenso(dateString, horaString = '20:00') {
    if (!dateString) return 'A definir';
    const partes = dateString.split('-');
    if (partes.length !== 3) return dateString;
    const ano = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    const dia = parseInt(partes[2], 10);
    const dataObj = new Date(ano, mes - 1, dia, 12, 0, 0);
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const diaSemana = diasSemana[dataObj.getDay()];
    const diaStr = String(dia).padStart(2, '0');
    const mesStr = String(mes).padStart(2, '0');
    let sufixoHora = '';
    if (horaString) {
      if (horaString.endsWith(':00')) {
        sufixoHora = ` até as ${parseInt(horaString, 10)}h`;
      } else {
        sufixoHora = ` até as ${horaString.replace(':', 'h')}`;
      }
    }
    return `${diaSemana} (${diaStr}/${mesStr})${sufixoHora}`;
  }

  function inicializarDatasParametrosMensagem() {
    const inputInicio = document.getElementById('msg-param-inicio-date');
    const inputEncerramento = document.getElementById('msg-param-encerramento-date');
    const inputHora = document.getElementById('msg-param-encerramento-time');
    const inputPix = document.getElementById('msg-param-pix');

    if (inputPix && !inputPix.value && state.chavePix) {
      inputPix.value = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarChavePix(state.chavePix) : state.chavePix;
    }

    if (inputInicio && !inputInicio.value) {
      const hoje = new Date();
      const dataSorteio = new Date();
      dataSorteio.setDate(hoje.getDate() + 5);
      const dataEncerra = new Date();
      dataEncerra.setDate(hoje.getDate() + 3);

      const toISO = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
      };

      inputInicio.value = toISO(dataSorteio);
      if (inputEncerramento && !inputEncerramento.value) {
        inputEncerramento.value = toISO(dataEncerra);
      }
      if (inputHora && !inputHora.value) {
        inputHora.value = '20:00';
      }
    }
  }

  // Troca de abas no modal de mensagens
  document.querySelectorAll('.msg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.msg-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.abaMensagemWhatsAppAtiva = btn.getAttribute('data-msg-tab');
      atualizarTextoMensagemWhatsApp();
    });
  });

  // Detecta quando o usuário digita/edita o texto da mensagem no textarea
  const txtAreaMsg = document.getElementById('relatorio-whatsapp-text');
  if (txtAreaMsg) {
    txtAreaMsg.addEventListener('input', () => {
      atualizarBadgeStatusMensagem('editado');
    });
  }

  // Função Global: Salvar Modelo de Mensagem Atual (Persistente para os próximos comunicados)
  window.salvarModeloWhatsApp = async function() {
    const btnSalvar = document.getElementById('btn-salvar-texto-whatsapp');
    const txtArea = document.getElementById('relatorio-whatsapp-text');
    if (!txtArea) return;

    const valor = txtArea.value;
    const tabAtual = state.abaMensagemWhatsAppAtiva || 'boletim';
    const nomeAba = getNomeAbaWhatsApp(tabAtual);

    const originalHtml = btnSalvar ? btnSalvar.innerHTML : '💾 Salvar Este Modelo';
    if (btnSalvar) {
      btnSalvar.disabled = true;
      btnSalvar.innerHTML = '⏳ Salvando Alterações...';
      btnSalvar.style.opacity = '0.85';
    }

    if (!state.textosWhatsAppCustomizados) {
      state.textosWhatsAppCustomizados = {};
    }
    state.textosWhatsAppCustomizados[tabAtual] = valor;

    // Sincroniza a chave Pix se o usuário tiver preenchido no input de parâmetros
    const inputPix = document.getElementById('msg-param-pix');
    if (inputPix && inputPix.value.trim()) {
      state.chavePix = (typeof MaskUtils !== 'undefined') ? MaskUtils.formatarChavePix(inputPix.value.trim()) : inputPix.value.trim();
    }

    // Persistência local no navegador
    try {
      localStorage.setItem('senaclube_textos_whatsapp', JSON.stringify(state.textosWhatsAppCustomizados));
    } catch (e) {
      console.warn('[SenaClube] Erro ao gravar localStorage:', e);
    }

    // Persistência no servidor / banco
    await salvarEstado();

    const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    atualizarBadgeStatusMensagem('customizado', agora);

    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.innerHTML = '✅ Modelo Salvo com Sucesso!';
      btnSalvar.style.backgroundColor = '#10b981';
      btnSalvar.style.borderColor = '#10b981';
      btnSalvar.style.color = '#ffffff';

      setTimeout(() => {
        btnSalvar.innerHTML = originalHtml;
        btnSalvar.style.backgroundColor = '';
        btnSalvar.style.borderColor = '';
        btnSalvar.style.color = '';
      }, 3000);
    }

    mostrarNotificacaoToast(`💾 Modelo "${nomeAba}" salvo como novo padrão!`);
  };

  // Listeners de clique para os botões do modal de mensagens
  document.getElementById('btn-salvar-texto-whatsapp')?.addEventListener('click', () => {
    window.salvarModeloWhatsApp();
  });

  // Atualiza em tempo real ao alterar qualquer campo dos parâmetros de comunicado (data, hora, pix)
  ['msg-param-inicio-date', 'msg-param-encerramento-date', 'msg-param-encerramento-time', 'msg-param-pix'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const handler = () => {
        const tabAtual = state.abaMensagemWhatsAppAtiva || 'boletim';
        const txtArea = document.getElementById('relatorio-whatsapp-text');
        const valDateInicio = document.getElementById('msg-param-inicio-date')?.value;
        const valDateEncerramento = document.getElementById('msg-param-encerramento-date')?.value;
        const valHoraEncerramento = document.getElementById('msg-param-encerramento-time')?.value || '20:00';
        const chavePix = (document.getElementById('msg-param-pix')?.value || '').trim();

        const dataInicio = formatarDataSorteioExtenso(valDateInicio);
        const dataEncerramento = formatarDataEncerramentoExtenso(valDateEncerramento, valHoraEncerramento);

        const badgeInicio = document.getElementById('badge-preview-inicio');
        if (badgeInicio) badgeInicio.textContent = dataInicio;

        const badgeEncerramento = document.getElementById('badge-preview-encerramento');
        if (badgeEncerramento) badgeEncerramento.textContent = dataEncerramento;

        if ((tabAtual === 'abertura-padrao' || tabAtual === 'lembrete-fechamento') && txtArea) {
          const ciclo = getCicloVisualizado();
          const baseText = (state.textosWhatsAppCustomizados && state.textosWhatsAppCustomizados[tabAtual])
            ? state.textosWhatsAppCustomizados[tabAtual]
            : txtArea.value;

          txtArea.value = aplicarParametrosDinamicosNoTexto(baseText, {
            nomeBolao: state.nomeBolao || 'Bolão dos amigos',
            cicloNome: ciclo.nome || 'Edição 1',
            concursoInicial: ciclo.concursoInicial || 3064,
            dataInicio,
            dataEncerramento,
            chavePix,
            valorCota: ciclo.valorCota || 30.0
          });
          // Se o usuário alterou parâmetros dinâmicos em relação ao modelo original, sinaliza status editado
          atualizarBadgeStatusMensagem('editado');
        }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    }
  });

  document.getElementById('btn-modal-relatorio').addEventListener('click', () => {
    // Sincroniza visual das abas com a abaMensagemWhatsAppAtiva
    const tabAtual = state.abaMensagemWhatsAppAtiva || 'boletim';
    document.querySelectorAll('.msg-tab-btn').forEach(b => {
      if (b.getAttribute('data-msg-tab') === tabAtual) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    atualizarTextoMensagemWhatsApp();
    abrirModal('modal-relatorio');
  });

  document.getElementById('btn-copiar-relatorio').addEventListener('click', async () => {
    const texto = document.getElementById('relatorio-whatsapp-text').value;
    const ok = await ExportShare.copiarTexto(texto);
    if (ok) {
      alert('📋 Texto copiado para a área de transferência! Cole no seu grupo de WhatsApp!');
    }
  });

  // Modal Exportar PDF
  document.getElementById('btn-modal-pdf').addEventListener('click', () => {
    abrirModal('modal-pdf');
  });

  // Alternar estilo ativo dos cards de opção de PDF
  document.querySelectorAll('.pdf-option-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.pdf-option-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  // Botão Gerar / Salvar PDF
  document.getElementById('btn-gerar-pdf').addEventListener('click', () => {
    const ciclo = getCicloVisualizado();
    const apuracao = BolaoEngine.apurar(ciclo.apostas, ciclo.concursos);
    const taxa = typeof ciclo.taxaOrganizador === 'number' ? ciclo.taxaOrganizador : state.taxaOrganizadorGlobal;
    const isDinamico = ciclo.premioQuadraDinamico !== false;
    const premioQuadra = typeof ciclo.premioQuadra === 'number' ? ciclo.premioQuadra : 0.0;
    const quadraPremiada = apuracao.ganhadoresQuadraPrimeiroSorteio && apuracao.ganhadoresQuadraPrimeiroSorteio.length > 0;
    const financeiro = BolaoEngine.calcularFinanceiro(ciclo.apostas, ciclo.valorCota, taxa, premioQuadra, quadraPremiada, isDinamico);

    const formatoRadio = document.querySelector('input[name="pdf-formato"]:checked');
    const formato = formatoRadio ? formatoRadio.value : 'compacta';
    const ordenacao = document.getElementById('pdf-ordenacao')?.value || 'alfabetica';
    const apenasConfirmadas = document.getElementById('pdf-apenas-confirmadas')?.checked || false;

    fecharModal('modal-pdf');
    ExportShare.abrirJanelaPDF(state, apuracao, financeiro, ciclo, formato, apenasConfirmadas, ordenacao);
  });

  // ==========================================================================
  // Controle de Acesso Administrativo (Botão no Header & 3 cliques no rodapé)
  // ==========================================================================
  function abrirModalLoginAdmin() {
    const userInput = document.getElementById('admin-user-input');
    const passInput = document.getElementById('admin-pass-input');
    const errBox = document.getElementById('admin-login-error');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    if (errBox) errBox.classList.add('hidden');
    abrirModal('modal-login-admin');
    setTimeout(() => passInput?.focus() || userInput?.focus(), 150);
  }

  let easterEggClicks = 0;
  let easterEggTimer = null;
  const easterEggEl = document.getElementById('footer-easter-egg');
  if (easterEggEl) {
    easterEggEl.addEventListener('click', () => {
      easterEggClicks++;
      if (easterEggTimer) clearTimeout(easterEggTimer);

      if (easterEggClicks >= 3) {
        easterEggClicks = 0;
        if (state.isAdmin) {
          mostrarNotificacaoToast('👑 Você já está no Modo Administrador!');
        } else {
          abrirModalLoginAdmin();
        }
      } else {
        easterEggTimer = setTimeout(() => {
          easterEggClicks = 0;
        }, 1500);
      }
    });
  }

  // Formulário de Login de Administrador via API
  const formLoginAdmin = document.getElementById('form-login-admin');
  if (formLoginAdmin) {
    formLoginAdmin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = (document.getElementById('admin-pass-input')?.value || '').trim();
      const btnSubmit = document.getElementById('btn-submit-login-admin');
      const errBox = document.getElementById('admin-login-error');
      if (errBox) errBox.classList.add('hidden');

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Autenticando...';
      }

      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: p })
        });
        const data = await res.json();

        if (res.ok && data.success && data.token) {
          sessionStorage.setItem('senaclube_admin_token', data.token);
          localStorage.setItem('senaclube_admin_token', data.token);
          state.isAdmin = true;
          document.body.classList.add('is-admin');
          fecharModal('modal-login-admin');
          mostrarNotificacaoToast('👑 Modo Administrador Ativado com Sucesso!');
          renderApp();
        } else {
          if (errBox) {
            errBox.textContent = data.error || 'Credencial inválida. Acesso negado.';
            errBox.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'Erro ao conectar ao servidor de autenticação.';
          errBox.classList.remove('hidden');
        }
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Entrar 🔓';
        }
      }
    });
  }

  // Botão Sair do Modo Administrador
  const btnLogoutAdmin = document.getElementById('btn-logout-admin');
  if (btnLogoutAdmin) {
    btnLogoutAdmin.addEventListener('click', () => {
      state.isAdmin = false;
      sessionStorage.removeItem('senaclube_admin_token');
      localStorage.removeItem('senaclube_admin_token');
      document.body.classList.remove('is-admin');
      mostrarNotificacaoToast('Modo Consulta Ativado.');
      renderApp();
    });
  }
}

function renderModalHistoricoCiclos() {
  const container = document.getElementById('historico-ciclos-container');
  container.innerHTML = '';

  state.ciclos.forEach(c => {
    const apuracao = BolaoEngine.apurar(c.apostas, c.concursos);
    const taxa = typeof c.taxaOrganizador === 'number' ? c.taxaOrganizador : state.taxaOrganizadorGlobal;
    const isDinamico = c.premioQuadraDinamico !== false;
    const premioQuadra = typeof c.premioQuadra === 'number' ? c.premioQuadra : 0.0;
    const quadraPremiada = apuracao.ganhadoresQuadraPrimeiroSorteio && apuracao.ganhadoresQuadraPrimeiroSorteio.length > 0;
    const fin = BolaoEngine.calcularFinanceiro(c.apostas, c.valorCota, taxa, premioQuadra, quadraPremiada, isDinamico);

    const primeiroConc = c.concursos.length > 0 ? c.concursos[0].numero : c.concursoInicial;
    const ultimoConc = c.concursos.length > 0 ? c.concursos[c.concursos.length - 1].numero : 'Em aberto';

    const quadraGanhadores = c.ganhadorQuadraNome
      ? c.ganhadorQuadraNome
      : (apuracao.ganhadoresQuadraPrimeiroSorteio && apuracao.ganhadoresQuadraPrimeiroSorteio.length > 0
          ? apuracao.ganhadoresQuadraPrimeiroSorteio.map(g => g.nome).join(', ')
          : null);

    const quadraLabel = (apuracao.ganhadoresQuadraPrimeiroSorteio && apuracao.ganhadoresQuadraPrimeiroSorteio.length > 1) || (quadraGanhadores && quadraGanhadores.includes(','))
      ? 'Vencedores da Quadra'
      : 'Vencedor da Quadra';

    const senaGanhadores = c.ganhadorSenaNome
      ? c.ganhadorSenaNome
      : (apuracao.ganhadoresSena && apuracao.ganhadoresSena.length > 0
          ? apuracao.ganhadoresSena.map(g => g.nome).join(', ')
          : null);

    const senaLabel = (apuracao.ganhadoresSena && apuracao.ganhadoresSena.length > 1) || (senaGanhadores && senaGanhadores.includes(','))
      ? 'Vencedores da Sena'
      : 'Vencedor da Sena';

    const card = document.createElement('div');
    card.className = 'historico-card';
    card.innerHTML = `
      <div class="historico-card-header">
        <div>
          <strong>${escapeHTML(c.nome)}</strong>
          <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 8px;">Concursos ${primeiroConc} até ${ultimoConc}</span>
        </div>
        <span class="historico-tag ${c.status === 'ativo' ? 'ativo' : 'finalizado'}">
          ${c.status === 'ativo' ? 'Edição em Andamento' : 'Finalizada'}
        </span>
      </div>

      <div class="historico-meta-grid">
        <div>Total de Apostas: <strong>${c.apostas.length.toLocaleString('pt-BR')}</strong></div>
        <div>Sorteios Apurados: <strong>${c.concursos.length}</strong></div>
        <div class="admin-only">Arrecadação Bruta: <strong>${formatarMoeda(fin.totalArrecadadoBruto)}</strong></div>
        <div class="admin-only">Taxa Organizador (20%): <strong style="color: var(--gold-primary);">${formatarMoeda(fin.valorOrganizadorArrecadado)}</strong></div>
        <div>Prêmio Pago da Quadra: <strong style="color: var(--gold-primary);">${formatarMoeda(fin.valorPagoQuadra)}</strong></div>
        <div>Prêmio Líquido da Sena: <strong style="color: var(--emerald-primary);">${formatarMoeda(fin.premioSenaLiquido)}</strong></div>
        <div>${senaLabel}: <strong>${escapeHTML(senaGanhadores || 'Nenhum')}</strong></div>
        <div>${quadraLabel}: <strong style="color: var(--gold-primary);">${escapeHTML(quadraGanhadores || 'Nenhum')}</strong></div>
      </div>

      <div class="historico-card-actions" style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle); gap: 10px;">
        <button class="btn btn-sm ${c.id === state.cicloVisualizadoId ? 'btn-primary' : 'btn-secondary'} btn-visualizar-ciclo" data-ciclo-id="${c.id}">
          ${c.id === state.cicloVisualizadoId ? '👁️ Edição em Exibição' : '📂 Abrir e Visualizar'}
        </button>
        <button class="btn btn-sm btn-danger-outline btn-excluir-ciclo-hist admin-only" data-ciclo-id="${c.id}" title="Excluir esta edição permanentemente">
          🗑️ Excluir Edição
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Eventos dos botões nos cards de histórico
  container.querySelectorAll('.btn-visualizar-ciclo').forEach(btn => {
    btn.addEventListener('click', () => {
      const cicloId = parseInt(btn.getAttribute('data-ciclo-id'), 10);
      state.cicloVisualizadoId = cicloId;
      state.paginaAtual = 1;
      fecharModal('modal-historico-ciclos');
      renderApp();
    });
  });

  container.querySelectorAll('.btn-excluir-ciclo-hist').forEach(btn => {
    btn.addEventListener('click', () => {
      const cicloId = parseInt(btn.getAttribute('data-ciclo-id'), 10);
      excluirCicloPorId(cicloId);
    });
  });
}

// ==========================================================================
// Exclusão de Ciclos (Mantendo as Apostas Zeradas para Nova Apuração)
// ==========================================================================
function excluirCicloPorId(cicloId) {
  const ciclo = state.ciclos.find(c => c.id === cicloId);
  if (!ciclo) return;

  const totalCiclos = state.ciclos.length;
  const numApostas = (ciclo.apostas || []).length;

  // Garante cópia íntegra das apostas dos apostadores para não perder nenhum participante
  const apostasPreservadas = (ciclo.apostas || []).map(a => ({
    id: a.id,
    nome: a.nome,
    dezenas: [...a.dezenas],
    pago: true,
    confirmada: true,
    origem: 'mantida',
    observacao: a.observacao || 'Mantida para nova apuração',
    criadoEm: a.criadoEm || new Date().toISOString()
  }));

  if (totalCiclos <= 1) {
    const confirmou = confirm(
      `🗑️ EXCLUIR EDIÇÃO:\n\n` +
      `Deseja realmente excluir a ${ciclo.nome} e reiniciar uma nova apuração?\n\n` +
      `• A edição atual e todos os ${ciclo.concursos.length} sorteios apurados serão excluídos.\n` +
      `• Todas as ${numApostas.toLocaleString('pt-BR')} apostas serão MANTIDAS (zeradas de acertos) prontas para uma nova edição de apuração.\n\n` +
      `Confirmar exclusão e reiniciar apuração?`
    );
    if (!confirmou) return;

    state.ciclos = [{
      id: 1,
      nome: 'Edição 1',
      status: 'ativo',
      concursoInicial: ciclo.concursoInicial || 3058,
      concursoFinal: null,
      valorCota: ciclo.valorCota || 24.0,
      taxaOrganizador: typeof ciclo.taxaOrganizador === 'number' ? ciclo.taxaOrganizador : (state.taxaOrganizadorGlobal || 0.20),
      premioQuadra: ciclo.premioQuadra || 0.0,
      concursos: [],
      apostas: apostasPreservadas,
      apostasDescartadas: [],
      faseApostas: 'aberta',
      alertasExibidos: { quadraCicloId: null, senaCicloId: null },
      ganhadorSenaNome: null,
      ganhadorQuadraNome: null,
      criadoEm: new Date().toISOString(),
      finalizadoEm: null
    }];
    state.cicloVisualizadoId = 1;
    state.paginaAtual = 1;
    salvarEstado();
    fecharModal('modal-config');
    fecharModal('modal-historico-ciclos');
    renderApp();
    alert(`🗑️ ${ciclo.nome} excluída! A apuração foi zerada e as ${apostasPreservadas.length.toLocaleString('pt-BR')} apostas foram preservadas com sucesso.`);
    return;
  }

  // Se houver mais de um ciclo
  const confirmou = confirm(
    `🗑️ EXCLUIR EDIÇÃO:\n\n` +
    `Deseja realmente EXCLUIR a "${ciclo.nome}"?\n\n` +
    `• Os sorteios e apurações desta edição serão excluídos.\n` +
    `• As apostas dos apostadores permanecerão preservadas e zeradas para uma nova apuração.\n\n` +
    `Confirmar exclusão?`
  );

  if (!confirmou) return;

  // De fato exclui o ciclo
  state.ciclos = state.ciclos.filter(c => c.id !== cicloId);

  // Se o ciclo excluído era o que estava sendo visualizado, muda para o remanescente
  if (state.cicloVisualizadoId === cicloId) {
    const ultimoAtivo = state.ciclos.find(c => c.status === 'ativo');
    state.cicloVisualizadoId = ultimoAtivo ? ultimoAtivo.id : state.ciclos[state.ciclos.length - 1].id;
  }

  // Se o ciclo remanescente não possui apostas, herda as apostas preservadas
  const cicloAtivo = state.ciclos.find(c => c.id === state.cicloVisualizadoId);
  if (cicloAtivo && (!cicloAtivo.apostas || cicloAtivo.apostas.length === 0) && apostasPreservadas.length > 0) {
    cicloAtivo.apostas = apostasPreservadas;
  }

  // Garante que pelo menos um ciclo esteja ativo
  const temAtivo = state.ciclos.some(c => c.status === 'ativo');
  if (!temAtivo && state.ciclos.length > 0) {
    state.ciclos[state.ciclos.length - 1].status = 'ativo';
  }

  state.paginaAtual = 1;
  salvarEstado();

  fecharModal('modal-config');
  const modalHist = document.getElementById('modal-historico-ciclos');
  if (modalHist && !modalHist.classList.contains('hidden')) {
    renderModalHistoricoCiclos();
  }

  renderApp();
  alert(`🗑️ "${ciclo.nome}" excluída com sucesso! As apostas foram preservadas e zeradas para a nova apuração.`);
}

// ==========================================================================
// Abertura Automática do Próximo Ciclo (Apenas com Nº do Concurso)
// ==========================================================================
function iniciarNovoCicloAutomatico(concursoInicial) {
  const concNum = parseInt(concursoInicial, 10);
  if (!concNum || isNaN(concNum) || concNum <= 0) {
    alert('Por favor, informe um número de concurso válido.');
    return;
  }

  const ultimoCiclo = state.ciclos[state.ciclos.length - 1];

  // Garante que qualquer ciclo ativo anterior esteja com status finalizado
  state.ciclos.forEach(c => {
    if (c.status === 'ativo') {
      c.status = 'finalizado';
      c.finalizadoEm = c.finalizadoEm || new Date().toISOString();
      if (c.concursos && c.concursos.length > 0) {
        c.concursoFinal = c.concursos[c.concursos.length - 1].numero;
      }
    }
  });

  const novoId = Math.max(...state.ciclos.map(c => c.id), 0) + 1;
  const novoNome = `Edição ${novoId}`;

  // Copia todas as apostas do ciclo anterior mantendo jogos, zerando acertos e marcando como pendente
  const apostasBase = (ultimoCiclo && ultimoCiclo.apostas) ? ultimoCiclo.apostas.map(a => ({
    id: 'aposta_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
    nome: a.nome,
    dezenas: [...a.dezenas],
    pago: false,
    confirmada: false,
    origem: 'mantida',
    observacao: 'Renovado da edição anterior',
    criadoEm: new Date().toISOString()
  })) : [];

  const valorCota = ultimoCiclo ? (ultimoCiclo.valorCota || 30.0) : 30.0;
  const taxa = state.taxaOrganizadorGlobal || 0.20;
  const pagasIniciais = apostasBase.filter(a => a.pago).length;
  const premioQuadraPadrao = BolaoEngine.calcularPremioQuadraPadrao(pagasIniciais, valorCota, taxa);

  const novoCiclo = {
    id: novoId,
    nome: novoNome,
    status: 'ativo',
    concursoInicial: concNum,
    concursoFinal: null,
    valorCota,
    taxaOrganizador: taxa,
    premioQuadra: premioQuadraPadrao,
    premioQuadraDinamico: true,
    concursos: [],
    apostas: apostasBase,
    apostasDescartadas: [],
    faseApostas: 'aberta',
    alertasExibidos: { quadraCicloId: null, senaCicloId: null },
    ganhadorSenaNome: null,
    ganhadorQuadraNome: null,
    criadoEm: new Date().toISOString(),
    finalizadoEm: null
  };

  state.ciclos.push(novoCiclo);
  state.cicloVisualizadoId = novoId;
  state.paginaAtual = 1;
  state.buscaTexto = '';

  salvarEstado();
  fecharModal('modal-sena');
  fecharModal('modal-novo-ciclo');
  renderApp();

  alert(`🎉 ${novoNome} iniciada com sucesso a partir do Concurso ${concNum}!\nTodas as ${apostasBase.length.toLocaleString('pt-BR')} apostas foram renovadas para a nova rodada.`);
}

// ==========================================================================
// Sincronização Automática com a Caixa
// ==========================================================================
async function sincronizarProximoConcursoCaixa() {
  const ciclo = getCicloVisualizado();
  if (ciclo.status === 'finalizado') {
    alert(`A ${ciclo.nome} já foi finalizada porque a Sena foi premiada!\nInicie a próxima edição para apurar novos sorteios.`);
    return;
  }
  const btn = document.getElementById('btn-sync-caixa');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Consultando Caixa...';

  try {
    let proximoConcurso = ciclo.concursoInicial;
    if (ciclo.concursos.length > 0) {
      const ultimoApurado = ciclo.concursos[ciclo.concursos.length - 1].numero;
      proximoConcurso = ultimoApurado + 1;
    }

    const dados = await CaixaAPI.buscarConcurso(proximoConcurso);

    if (!dados.dezenas || dados.dezenas.length !== 6) {
      alert(`O Concurso ${proximoConcurso} ainda não foi realizado ou as dezenas não foram apuradas pela Caixa.`);
      return;
    }

    ciclo.concursos.push({
      numero: dados.numero,
      dataApuracao: dados.dataApuracao,
      dezenas: dados.dezenas
    });

    ciclo.concursos.sort((a, b) => a.numero - b.numero);
    salvarEstado();
    renderApp();

    if (ciclo.status === 'finalizado') {
      mostrarNotificacaoToast(`🏆 Concurso ${dados.numero} apurado: Ganhador(es) da Sena identificado(s)! Edição encerrada.`);
    } else {
      mostrarNotificacaoToast(`✅ Concurso ${dados.numero} apurado com sucesso na ${ciclo.nome}!`);
    }
  } catch (err) {
    alert(`Não foi possível buscar na Caixa automaticamente: ${err.message}.\nVocê pode inserir as dezenas manualmente pelo botão "Inserir Sorteio Manual".`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function sincronizarUltimoCaixaHeader() {
  try {
    const ultimo = await CaixaAPI.buscarConcurso(null);
    const el = document.getElementById('header-caixa-ultimo');
    if (el && ultimo && ultimo.numero) {
      el.textContent = `Conc. ${ultimo.numero} (${ultimo.dataApuracao})`;
    }
  } catch (e) {
    const el = document.getElementById('header-caixa-ultimo');
    if (el) el.textContent = 'API Caixa indisponível';
  }
}

function abrirModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function fecharModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function formatarMoeda(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function mostrarNotificacaoToast(msg) {
  let toast = document.getElementById('senaclube-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'senaclube-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #064e3b;
      color: #fff;
      padding: 14px 22px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      border: 1px solid #10b981;
      font-weight: 600;
      font-size: 0.95rem;
      z-index: 99999;
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(15px);
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
  }, 3500);
}
