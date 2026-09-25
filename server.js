import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'senaclube.json');

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[SenaClube] Supabase conectado com sucesso em:', supabaseUrl);
  } catch (err) {
    console.warn('[SenaClube] Erro ao instanciar Supabase:', err.message);
  }
}

// Garante que o diretório de dados exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Tipos MIME comuns
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Cache simples em memória para concursos da Caixa
const CAIXA_CACHE = new Map();

async function fetchCaixaConcurso(numero = null) {
  const cacheKey = numero ? `conc_${numero}` : 'conc_latest';
  if (CAIXA_CACHE.has(cacheKey)) {
    const cached = CAIXA_CACHE.get(cacheKey);
    // Cache de 10 minutos para último, 24 horas para anteriores
    const maxAge = numero ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
    if (Date.now() - cached.timestamp < maxAge) {
      return cached.data;
    }
  }

  const url = numero
    ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${numero}`
    : `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://loterias.caixa.gov.br/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Status Caixa ${res.status}`);
    }

    const data = await res.json();
    const result = {
      numero: data.numero,
      dataApuracao: data.dataApuracao,
      dezenas: data.listaDezenas || data.dezenasSorteadasOrdemSorteio || [],
      acumulado: data.acumulado,
      valorAcumuladoProximoConcurso: data.valorAcumuladoProximoConcurso,
      nomeMunicipioUFSorteio: data.nomeMunicipioUFSorteio || '',
      fonte: 'oficial_caixa'
    };

    CAIXA_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[Caixa API] Falha na busca primária (${url}):`, err.message);

    // 2. Tenta espelho Guidi (altamente confiável e com mesmo schema)
    try {
      const guidiUrl = numero
        ? `https://api.guidi.dev.br/loteria/megasena/${numero}`
        : `https://api.guidi.dev.br/loteria/megasena/ultimo`;
      const guidiCtrl = new AbortController();
      const guidiTimeout = setTimeout(() => guidiCtrl.abort(), 6000);
      const guidiRes = await fetch(guidiUrl, { signal: guidiCtrl.signal });
      clearTimeout(guidiTimeout);
      if (guidiRes.ok) {
        const gData = await guidiRes.json();
        const fallbackResult = {
          numero: gData.numero,
          dataApuracao: gData.dataApuracao || '',
          dezenas: gData.listaDezenas || gData.dezenasSorteadasOrdemSorteio || [],
          acumulado: gData.acumulado || false,
          valorAcumuladoProximoConcurso: gData.valorAcumuladoProximoConcurso || 0,
          nomeMunicipioUFSorteio: gData.nomeMunicipioUFSorteio || '',
          fonte: 'espelho_guidi'
        };
        CAIXA_CACHE.set(cacheKey, { timestamp: Date.now(), data: fallbackResult });
        return fallbackResult;
      }
    } catch (guidiErr) {
      console.warn('[Caixa API] Falha no espelho Guidi:', guidiErr.message);
    }

    // 3. Tenta espelho Heroku (fallback terciário)
    try {
      const mirrorUrl = numero
        ? `https://loteriascaixa-api.herokuapp.com/api/megasena/${numero}`
        : `https://loteriascaixa-api.herokuapp.com/api/megasena/latest`;
      const mCtrl = new AbortController();
      const mTimeout = setTimeout(() => mCtrl.abort(), 6000);
      const mirrorRes = await fetch(mirrorUrl, { signal: mCtrl.signal });
      clearTimeout(mTimeout);
      if (mirrorRes.ok) {
        const mData = await mirrorRes.json();
        const fallbackResult = {
          numero: mData.concurso || mData.numero,
          dataApuracao: mData.data || mData.dataApuracao || '',
          dezenas: mData.dezenas || [],
          acumulado: mData.acumulou || false,
          valorAcumuladoProximoConcurso: mData.valorAcumuladoProximoConcurso || 0,
          nomeMunicipioUFSorteio: mData.local || '',
          fonte: 'espelho_loterias'
        };
        CAIXA_CACHE.set(cacheKey, { timestamp: Date.now(), data: fallbackResult });
        return fallbackResult;
      }
    } catch (mirrorErr) {
      console.warn('[Caixa API] Falha no espelho Heroku:', mirrorErr.message);
    }
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = reqUrl.pathname;

  // Normalização caso o proxy ou rewrites passem com prefixo /public
  if (pathname.startsWith('/public/')) {
    pathname = pathname.substring(7);
    if (!pathname.startsWith('/')) pathname = '/' + pathname;
  }

  // --- API: Buscar concurso da Caixa ---
  if (pathname.startsWith('/api/caixa')) {
    let param = pathname.replace('/api/caixa', '').replace(/^\//, '').trim();
    const queryParam = reqUrl.searchParams.get('param');
    if ((!param || param === '[param]') && queryParam) {
      param = queryParam.trim();
    }
    try {
      const concNum = (!param || param === 'ultimo' || param === '[param]') ? null : parseInt(param, 10);
      const data = await fetchCaixaConcurso(isNaN(concNum) ? null : concNum);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: false,
        error: 'Não foi possível consultar a Caixa neste momento.',
        details: err.message
      }));
    }
    return;
  }

  // --- API: Salvar ou carregar estado do bolão ---
  if (pathname === '/api/bolao') {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('bolao_data')
            .select('*')
            .eq('id', 'sena_clube_master')
            .single();

          if (!error && data && data.estado_json) {
            res.writeHead(200);
            return res.end(JSON.stringify(data.estado_json));
          }
          if (error && error.code !== 'PGRST116') {
            console.warn('[Supabase GET] Aviso:', error.message);
          }
        } catch (err) {
          console.error('[Supabase GET] Erro de conexão:', err.message);
        }
      }

      try {
        if (fs.existsSync(DATA_FILE)) {
          const content = fs.readFileSync(DATA_FILE, 'utf-8');
          res.writeHead(200);
          return res.end(content);
        } else {
          res.writeHead(200);
          return res.end(JSON.stringify({ exists: false, data: null }));
        }
      } catch (err) {
        console.error('[SenaClube] Erro ao carregar dados:', err);
        res.writeHead(500);
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          parsed.savedAt = new Date().toISOString();

          // Tenta salvar localmente
          try {
            if (fs.existsSync(DATA_DIR)) {
              fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
            }
          } catch (localErr) {
            console.warn('[SenaClube] Aviso de gravação local em disco:', localErr.message);
          }

          // Salva no Supabase se disponível
          if (supabase) {
            try {
              const { error } = await supabase
                .from('bolao_data')
                .upsert({
                  id: 'sena_clube_master',
                  nome_bolao: parsed.nomeBolao || 'Bolão Mega Sena dos amigos',
                  taxa_organizador_global: parsed.taxaOrganizadorGlobal || 0.20,
                  ciclo_visualizado_id: parsed.cicloVisualizadoId || 1,
                  estado_json: parsed,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

              if (error) {
                console.error('[Supabase POST] Erro upsert:', error.message);
              }
            } catch (supErr) {
              console.error('[Supabase POST] Erro de rede:', supErr.message);
            }
          }

          console.log(`[SenaClube] Dados salvos com sucesso às ${parsed.savedAt}:`, {
            nomeBolao: parsed.nomeBolao,
            ciclos: parsed.ciclos?.length,
            cota: parsed.ciclos?.[0]?.valorCota,
            premioQuadra: parsed.ciclos?.[0]?.premioQuadra
          });
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          });
          res.end(JSON.stringify({ success: true, message: 'Dados salvos com sucesso!' }));
        } catch (err) {
          console.error('[SenaClube] Erro ao salvar POST /api/bolao:', err);
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'JSON inválido', details: err.message }));
        }
      });
      return;
    }
  }

  // --- Servir arquivos estáticos ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Segurança simples contra directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acesso Proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Se não achar, fallback para index.html (SPA)
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Arquivo não encontrado');
      } else {
        const headers = { 'Content-Type': contentType };
        if (ext === '.html' || ext === '.js') {
          headers['Cache-Control'] = 'no-cache, must-revalidate';
        }
        res.writeHead(200, headers);
        res.end(data);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`[SenaClube] Servidor ativo em http://localhost:${PORT}`);
});
