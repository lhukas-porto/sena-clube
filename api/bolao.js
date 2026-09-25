import { createClient } from '@supabase/supabase-js';
import { verifyToken } from './_auth.js';
import { validateBolaoPayload, sanitizePayload } from './_validation.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
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
    if (supabase) {
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
      } catch (err) {
        console.error('[Supabase GET] Erro de conexão:', err);
      }
    }

    return res.status(200).json({ exists: false, data: null });
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

    try {
      const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const body = sanitizePayload(rawBody);

      // 2. Validação de Schema e Integridade
      const validation = validateBolaoPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error
        });
      }

      // 3. Trava Otimista de Concorrência
      let currentVersion = 0;
      if (supabase) {
        try {
          const { data: currentData } = await supabase
            .from('bolao_data')
            .select('estado_json')
            .eq('id', 'sena_clube_master')
            .single();

          if (currentData && currentData.estado_json) {
            currentVersion = currentData.estado_json.version || 0;
          }
        } catch (fetchErr) {
          console.warn('[Supabase Concurrency Check] Aviso:', fetchErr.message);
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

      if (supabase) {
        const { error } = await supabase
          .from('bolao_data')
          .upsert({
            id: 'sena_clube_master',
            nome_bolao: body.nomeBolao || 'Bolão Mega Sena dos amigos',
            taxa_organizador_global: body.taxaOrganizadorGlobal || 0.20,
            ciclo_visualizado_id: body.cicloVisualizadoId || 1,
            estado_json: body,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (error) {
          throw error;
        }

        return res.status(200).json({
          success: true,
          message: 'Dados salvos no Supabase com sucesso!',
          version: nextVersion,
          savedAt: body.savedAt
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Processado sem conexão ativa do Supabase',
        version: nextVersion,
        savedAt: body.savedAt
      });
    } catch (err) {
      console.error('[Supabase POST] Erro ao salvar:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
