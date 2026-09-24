import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'senaclube.json');

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
    console.warn(`[Caixa API] Falha na busca (${url}):`, err.message);
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
  const pathname = reqUrl.pathname;

  // --- API: Buscar concurso da Caixa ---
  if (pathname.startsWith('/api/caixa/')) {
    const param = pathname.replace('/api/caixa/', '').trim();
    try {
      const concNum = (param === 'ultimo' || !param) ? null : parseInt(param, 10);
      const data = await fetchCaixaConcurso(concNum);
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
      try {
        if (fs.existsSync(DATA_FILE)) {
          const content = fs.readFileSync(DATA_FILE, 'utf-8');
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
          });
          res.end(content);
        } else {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
          });
          res.end(JSON.stringify({ exists: false, data: null }));
        }
      } catch (err) {
        console.error('[SenaClube] Erro ao carregar dados:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          parsed.savedAt = new Date().toISOString();
          fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
          console.log(`[SenaClube] Dados salvos com sucesso no backend às ${parsed.savedAt}:`, {
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
