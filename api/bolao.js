/**
 * SenaClube — API Serverless do Bolão (/api/bolao)
 * Persistência atômica e durável no Supabase, controle otimista de versão,
 * proteção server-side de edições fechadas e tratamento de taxa zero.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyToken } from './_auth.js';
import { validateBolaoPayload, sanitizePayload } from './_validation.js';

const supabaseUrl = process.env.SUPABASE_URL;
// Backend deve preferencialmente usar a chave service_role para garantir escrita sob RLS restrito
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.warn('[Bolao API] Erro ao instanciar Supabase:', err.message);
  }
}

/**
 * Validação de integridade no servidor para edições fechadas ou finalizadas
 * Impede que uma requisição autenticada reabra ou altere apostas de um ciclo travado
 */
function validarRegrasFechamentoServidor(incomingCiclos, existingCiclos) {
  if (!Array.isArray(incomingCiclos) || !Array.isArray(existingCiclos)) return { valid: true };

  const existingMap = new Map();
  existingCiclos.forEach(c => {
    if (c && c.id !== undefined) existingMap.set(String(c.id), c);
  });

  const now = Date.now();

  for (const inCiclo of incomingCiclos) {
    if (!inCiclo || inCiclo.id === undefined) continue;
    const existing = existingMap.get(String(inCiclo.id));
    if (!existing) continue;

    const estavaFechado = existing.status === 'finalizado' || existing.faseApostas === 'fechada';
    const prazoExpirado = existing.dataLimiteApostas && (now >= new Date(existing.dataLimiteApostas).getTime());

    // 1. Não permite reabrir edição finalizada
    if (existing.status === 'finalizado' && inCiclo.status !== 'finalizado') {
      return {
        valid: false,
        error: `A edição "${existing.nome}" já foi finalizada e não pode ser reaberta via API.`
      };
    }

    // 2. Não permite reabrir apostas se a data limite do servidor já expirou
    if (prazoExpirado && inCiclo.faseApostas === 'aberta') {
      return {
        valid: false,
        error: `O prazo limite de inscrições da edição "${existing.nome}" já expirou. Não é permitido reabrir apostas.`
      };
    }

    // 3. Se as apostas já estavam fechadas, nenhuma aposta pode ser adicionada, removida ou ter números alterados
    if (estavaFechado) {
      const existingApostas = existing.apostas || [];
      const incomingApostas = inCiclo.apostas || [];

      if (incomingApostas.length !== existingApostas.length) {
        return {
          valid: false,
          error: `Apostas fechadas na edição "${existing.nome}". Não é permitido adicionar ou excluir apostas.`
        };
      }

      // Confere se as dezenas foram mantidas intactas
      const existingApostaMap = new Map();
      existingApostas.forEach(a => existingApostaMap.set(String(a.id), a));

      for (const inAp of incomingApostas) {
        const exAp = existingApostaMap.get(String(inAp.id));
        if (!exAp) {
          return {
            valid: false,
            error: `Aposta não reconhecida enviada para a edição fechada "${existing.nome}".`
          };
        }
        const exDez = (exAp.dezenas || []).slice().sort((a, b) => a - b).join(',');
        const inDez = (inAp.dezenas || []).slice().sort((a, b) => a - b).join(',');
        if (exDez !== inDez) {
          return {
            valid: false,
            error: `As dezenas da aposta de "${inAp.nome}" não podem ser modificadas com apostas fechadas.`
          };
        }
      }
    }
  }

  return { valid: true };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Version, X-Force-Save');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- GET: Carregar estado do bolão ---
  if (req.method === 'GET') {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Serviço de banco de dados não configurado.'
      });
    }

    try {
      const { data, error } = await supabase
        .from('bolao_data')
        .select('*')
        .eq('id', 'sena_clube_master')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('[Supabase GET] Aviso:', error.message);
      }

      if (data && data.estado_json) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.status(200).json(data.estado_json);
      }

      return res.status(200).json({ exists: false, data: null });
    } catch (err) {
      console.error('[Supabase GET] Erro de conexão:', err);
      return res.status(500).json({ success: false, error: 'Erro de conexão com o banco de dados.' });
    }
  }

  // --- POST: Salvar estado do bolão (Protegido) ---
  if (req.method === 'POST') {
    // 1. Verificação de Autenticação (Bearer Token)
    const authHeader = req.headers.authorization || req.headers['authorization'] || '';
    if (!verifyToken(authHeader)) {
      return res.status(401).json({
        success: false,
        error: 'Acesso não autorizado. É necessário estar logado como administrador para salvar alterações.'
      });
    }

    if (!supabase) {
      // Modo serverless exige persistência durável no Supabase
      return res.status(503).json({
        success: false,
        error: 'Gravação recusada: Supabase não está configurado neste ambiente serverless. Nenhuma gravação durável pode ser garantida.'
      });
    }

    try {
      const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const body = sanitizePayload(rawBody);

      // 2. Validação de Schema e Integridade Estrita
      const validation = validateBolaoPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error
        });
      }

      // 3. Trava Otimista de Concorrência e Validação de Estado
      let currentVersion = 0;
      let existingData = null;

      try {
        const { data: currentRecord } = await supabase
          .from('bolao_data')
          .select('estado_json')
          .eq('id', 'sena_clube_master')
          .single();

        if (currentRecord && currentRecord.estado_json) {
          existingData = currentRecord.estado_json;
          currentVersion = existingData.version || 0;
        }
      } catch (fetchErr) {
        console.warn('[Supabase Concurrency Check] Aviso:', fetchErr.message);
      }

      // 4. Validação Server-side de Fechamento de Apostas
      if (existingData && existingData.ciclos) {
        const regraCheck = validarRegrasFechamentoServidor(body.ciclos, existingData.ciclos);
        if (!regraCheck.valid) {
          return res.status(403).json({
            success: false,
            error: regraCheck.error
          });
        }
      }

      const clientVersion = typeof body.version === 'number' ? body.version : 0;
      const forceSave = req.headers['x-force-save'] === 'true' || body.forceSave === true;

      if (!forceSave && currentVersion > 0 && clientVersion > 0 && currentVersion > clientVersion) {
        return res.status(409).json({
          success: false,
          conflict: true,
          error: 'Conflito de Concorrência: os dados do bolão foram atualizados em outro dispositivo. Recarregue a página antes de salvar para não sobrescrever alterações recentes.',
          serverVersion: currentVersion,
          clientVersion
        });
      }

      const nextVersion = Math.max(currentVersion, clientVersion) + 1;
      body.version = nextVersion;
      body.savedAt = new Date().toISOString();

      // Suporte explícito a taxa 0% (evita operador || que substituiria 0 por 0.20)
      const taxaGlobalFinal = typeof body.taxaOrganizadorGlobal === 'number'
        ? body.taxaOrganizadorGlobal
        : 0.20;

      const { error: upsertError } = await supabase
        .from('bolao_data')
        .upsert({
          id: 'sena_clube_master',
          nome_bolao: body.nomeBolao || 'Bolão Mega Sena dos amigos',
          taxa_organizador_global: taxaGlobalFinal,
          ciclo_visualizado_id: body.cicloVisualizadoId || 1,
          estado_json: body,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (upsertError) {
        console.error('[Supabase POST] Erro upsert:', upsertError.message);
        return res.status(500).json({
          success: false,
          error: 'Falha ao persistir dados no banco de dados Supabase.',
          details: upsertError.message
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Dados salvos no Supabase com sucesso!',
        version: nextVersion,
        savedAt: body.savedAt
      });
    } catch (err) {
      console.error('[Supabase POST] Erro ao salvar:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
