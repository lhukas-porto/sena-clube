import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  // --- POST: Salvar estado do bolão ---
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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

        return res.status(200).json({ success: true, message: 'Dados salvos no Supabase com sucesso!' });
      }

      return res.status(200).json({ success: true, message: 'Processado sem conexão ativa do Supabase' });
    } catch (err) {
      console.error('[Supabase POST] Erro ao salvar:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
