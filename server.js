import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  checkPassword,
  generateToken,
  verifyToken,
  verifyAdminLogin,
  updateAdminCredentials,
  getAdminProfile,
  checkRateLimit,
  recordLoginAttempt,
  loadStoredCredentials
} from './api/_auth.js';
import { validateBolaoPayload, sanitizePayload } from './api/_validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'senaclube.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB limite de segurança contra DoS

// Supabase Client (suporte a service_role para RLS restrito)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[SenaClube] Supabase conectado com sucesso em:', supabaseUrl);
  } catch (err) {
    console.warn('[SenaClube] Erro ao instanciar Supabase:', err.message);
  }
}

// Garante que os diretórios necessários existam
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
} catch (fsErr) {}

function salvarBackupSnapshot(dadosAtuais) {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUPS_DIR, `senaclube_${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(dadosAtuais, null, 2), 'utf-8');

    // Mantém no máximo os últimos 20 backups locais
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('senaclube_') && f.endsWith('.json'))
      .sort();
    if (files.length > 20) {
      files.slice(0, files.length - 20).forEach(f => {
        try { fs.unlinkSync(path.join(BACKUPS_DIR, f)); } catch {}
      });
    }
  } catch (err) {
    console.warn('[SenaClube] Erro ao gerar snapshot de backup:', err.message);
  }
}

function validarDezenasConcurso(dezenas) {
  if (!Array.isArray(dezenas) || dezenas.length !== 6) return null;
  const normalizadas = [];
  for (const d of dezenas) {
    const num = parseInt(d, 10);
    if (isNaN(num) || num < 1 || num > 60 || normalizadas.includes(num)) {
      return null;
    }
    normalizadas.push(num);
  }
  return normalizadas.sort((a, b) => a - b).map(n => String(n).padStart(2, '0'));
}

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

    if (existing.status === 'finalizado' && inCiclo.status !== 'finalizado') {
      return {
        valid: false,
        error: `A edição "${existing.nome}" já foi finalizada e não pode ser reaberta via API.`
      };
    }

    if (prazoExpirado && inCiclo.faseApostas === 'aberta') {
      return {
        valid: false,
        error: `O prazo limite de inscrições da edição "${existing.nome}" já expirou. Não é permitido reabrir apostas.`
      };
    }

    if (estavaFechado) {
      const existingApostas = existing.apostas || [];
      const incomingApostas = inCiclo.apostas || [];

      if (incomingApostas.length !== existingApostas.length) {
        return {
          valid: false,
          error: `Apostas fechadas na edição "${existing.nome}". Não é permitido adicionar ou excluir apostas.`
        };
      }

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

// Cache em memória para concursos da Caixa
const CAIXA_CACHE = new Map();

async function fetchCaixaConcurso(numero = null) {
  const cacheKey = numero ? `conc_${numero}` : 'conc_latest';
  if (CAIXA_CACHE.has(cacheKey)) {
    const cached = CAIXA_CACHE.get(cacheKey);
    const maxAge = numero ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
    if (Date.now() - cached.timestamp < maxAge) {
      return cached.data;
    }
  }

  const url = numero
    ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${numero}`
    : `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

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

    if (res.ok) {
      const data = await res.json();
      const numRetornado = parseInt(data.numero, 10);
      const dezenasValidadas = validarDezenasConcurso(data.listaDezenas || data.dezenasSorteadasOrdemSorteio);

      if (numRetornado && (!numero || numRetornado === numero) && dezenasValidadas) {
        const result = {
          numero: numRetornado,
          dataApuracao: data.dataApuracao || '',
          dezenas: dezenasValidadas,
          acumulado: !!data.acumulado,
          valorAcumuladoProximoConcurso: data.valorAcumuladoProximoConcurso || 0,
          nomeMunicipioUFSorteio: data.nomeMunicipioUFSorteio || '',
          fonte: 'oficial_caixa'
        };
        CAIXA_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    }
  } catch (err) {
    clearTimeout(timeout);
  }

  // 2. Espelho Guidi
  try {
    const guidiUrl = numero
      ? `https://api.guidi.dev.br/loteria/megasena/${numero}`
      : `https://api.guidi.dev.br/loteria/megasena/ultimo`;
    const guidiCtrl = new AbortController();
    const guidiTimeout = setTimeout(() => guidiCtrl.abort(), 5000);
    const guidiRes = await fetch(guidiUrl, { signal: guidiCtrl.signal });
    clearTimeout(guidiTimeout);
    if (guidiRes.ok) {
      const gData = await guidiRes.json();
      const numRetornado = parseInt(gData.numero, 10);
      const dezenasValidadas = validarDezenasConcurso(gData.listaDezenas || gData.dezenasSorteadasOrdemSorteio);

      if (numRetornado && (!numero || numRetornado === numero) && dezenasValidadas) {
        const fallbackResult = {
          numero: numRetornado,
          dataApuracao: gData.dataApuracao || '',
          dezenas: dezenasValidadas,
          acumulado: !!gData.acumulado,
          valorAcumuladoProximoConcurso: gData.valorAcumuladoProximoConcurso || 0,
          nomeMunicipioUFSorteio: gData.nomeMunicipioUFSorteio || '',
          fonte: 'espelho_guidi'
        };
        CAIXA_CACHE.set(cacheKey, { timestamp: Date.now(), data: fallbackResult });
        return fallbackResult;
      }
    }
  } catch (guidiErr) {}

  // 3. Espelho Heroku
  try {
    const mirrorUrl = numero
      ? `https://loteriascaixa-api.herokuapp.com/api/megasena/${numero}`
      : `https://loteriascaixa-api.herokuapp.com/api/megasena/latest`;
    const mCtrl = new AbortController();
    const mTimeout = setTimeout(() => mCtrl.abort(), 5000);
    const mirrorRes = await fetch(mirrorUrl, { signal: mCtrl.signal });
    clearTimeout(mTimeout);
    if (mirrorRes.ok) {
      const mData = await mirrorRes.json();
      const numRetornado = parseInt(mData.concurso || mData.numero, 10);
      const dezenasValidadas = validarDezenasConcurso(mData.dezenas);

      if (numRetornado && (!numero || numRetornado === numero) && dezenasValidadas) {
        const fallbackResult = {
          numero: numRetornado,
          dataApuracao: mData.data || mData.dataApuracao || '',
          dezenas: dezenasValidadas,
          acumulado: !!(mData.acumulou || mData.acumulado),
          valorAcumuladoProximoConcurso: mData.valorAcumuladoProximoConcurso || 0,
          nomeMunicipioUFSorteio: mData.local || '',
          fonte: 'espelho_loterias'
        };
        CAIXA_CACHE.set(cacheKey, { timestamp: Date.now(), data: fallbackResult });
        return fallbackResult;
      }
    }
  } catch (mirrorErr) {}

  throw new Error('Não foi possível obter dados válidos da Caixa ou de seus espelhos.');
}

const server = http.createServer(async (req, res) => {
  // Cabeçalhos de Segurança OWASP e CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Version, X-Force-Save');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = reqUrl.pathname;

  if (pathname.startsWith('/public/')) {
    pathname = pathname.substring(7);
    if (!pathname.startsWith('/')) pathname = '/' + pathname;
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'global').split(',')[0].trim();

  // Função auxiliar para leitura segura de body com limite de tamanho
  const lerBodySeguro = () => new Promise((resolve, reject) => {
    let body = '';
    let bodyLength = 0;
    req.on('data', chunk => {
      bodyLength += chunk.length;
      if (bodyLength > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', err => reject(err));
  });

  // --- API: Autenticação & Credenciais de Administrador ---
  if (pathname === '/api/auth') {
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization || req.headers['authorization'] || '';
      if (!verifyToken(authHeader)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado' }));
      }
      try {
        const profile = await getAdminProfile();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, profile }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    try {
      const rawBody = await lerBodySeguro();
      const parsed = JSON.parse(rawBody || '{}');

      // Alteração de Credenciais
      const isChangeAction = req.method === 'PUT' || (req.method === 'POST' && (parsed.action === 'change-credentials' || parsed.currentPassword || parsed.senhaAtual));

      if (isChangeAction) {
        const authHeader = req.headers.authorization || req.headers['authorization'] || '';
        if (!verifyToken(authHeader)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: 'É necessário estar autenticado como administrador para alterar credenciais.'
          }));
        }

        const currentPassword = parsed.currentPassword || parsed.senhaAtual;
        const newUsername = parsed.newUsername || parsed.novoUsuario;
        const newPassword = parsed.newPassword || parsed.novaSenha;

        const result = await updateAdminCredentials({ currentPassword, newUsername, newPassword });
        const statusCode = result.success ? 200 : 400;
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      // Login Normal
      if (req.method === 'POST') {
        const rateCheck = checkRateLimit(clientIp);
        if (!rateCheck.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: rateCheck.error,
            remainingSeconds: rateCheck.remainingSeconds
          }));
        }

        const username = parsed.username || parsed.usuario || 'admin';
        const password = parsed.password || parsed.senha;

        if (!password) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'A senha é obrigatória.' }));
        }

        const isValid = await verifyAdminLogin(username, password);
        if (!isValid) {
          recordLoginAttempt(clientIp, false);
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Credencial inválida. Usuário ou senha incorretos.'
          }));
        }

        recordLoginAttempt(clientIp, true);
        const stored = await loadStoredCredentials();
        const token = generateToken(stored ? stored.tokenVersion : 1, stored ? stored.updatedAt : null);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          message: 'Autenticado com sucesso!',
          token,
          username
        }));
      }

      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Método não permitido' }));
    } catch (err) {
      if (err.message === 'PAYLOAD_TOO_LARGE') {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'Corpo da requisição excede o limite máximo permitido (2MB).' }));
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'JSON inválido', details: err.message }));
    }
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
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    if (req.method === 'POST') {
      // 1. Verificação de Autenticação
      const authHeader = req.headers.authorization || req.headers['authorization'] || '';
      if (!verifyToken(authHeader)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: false,
          error: 'Acesso não autorizado. É necessário estar logado como administrador para salvar alterações.'
        }));
      }

      try {
        const rawBody = await lerBodySeguro();
        const rawParsed = JSON.parse(rawBody);
        const parsed = sanitizePayload(rawParsed);

        // 2. Validação Estrita de Schema
        const validation = validateBolaoPayload(parsed);
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: validation.error }));
        }

        // 3. Concorrência e Snapshot Local
        let currentVersion = 0;
        let currentData = null;

        if (supabase) {
          try {
            const { data: supData } = await supabase
              .from('bolao_data')
              .select('estado_json')
              .eq('id', 'sena_clube_master')
              .single();
            if (supData && supData.estado_json) {
              currentVersion = supData.estado_json.version || 0;
              currentData = supData.estado_json;
            }
          } catch (supErr) {
            console.warn('[Supabase Concurrency Check] Aviso:', supErr.message);
          }
        }

        if (currentVersion === 0 && fs.existsSync(DATA_FILE)) {
          try {
            currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            currentVersion = currentData.version || 0;
          } catch {}
        }

        // 4. Validação Server-side de Edição Fechada
        if (currentData && currentData.ciclos) {
          const regraCheck = validarRegrasFechamentoServidor(parsed.ciclos, currentData.ciclos);
          if (!regraCheck.valid) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: regraCheck.error }));
          }
        }

        const clientVersion = typeof parsed.version === 'number' ? parsed.version : 0;
        const forceSave = req.headers['x-force-save'] === 'true' || parsed.forceSave === true;

        if (!forceSave && currentVersion > 0 && clientVersion > 0 && currentVersion > clientVersion) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            conflict: true,
            error: 'Conflito de Concorrência: os dados foram atualizados em outro dispositivo. Recarregue a página antes de salvar.',
            serverVersion: currentVersion,
            clientVersion
          }));
        }

        if (currentData) {
          salvarBackupSnapshot(currentData);
        }

        const nextVersion = Math.max(currentVersion, clientVersion) + 1;
        parsed.version = nextVersion;
        parsed.savedAt = new Date().toISOString();

        let gravouLocal = false;
        let gravouSupabase = false;
        let erroSupabase = null;

        // Salva localmente
        try {
          if (fs.existsSync(DATA_DIR)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
            gravouLocal = true;
          }
        } catch (localErr) {
          console.warn('[SenaClube] Erro de gravação local em disco:', localErr.message);
        }

        // Salva no Supabase se disponível
        if (supabase) {
          try {
            const taxaGlobal = typeof parsed.taxaOrganizadorGlobal === 'number'
              ? parsed.taxaOrganizadorGlobal
              : 0.20;

            const { error } = await supabase
              .from('bolao_data')
              .upsert({
                id: 'sena_clube_master',
                nome_bolao: parsed.nomeBolao || 'Bolão Mega Sena dos amigos',
                taxa_organizador_global: taxaGlobal,
                ciclo_visualizado_id: parsed.cicloVisualizadoId || 1,
                estado_json: parsed,
                updated_at: new Date().toISOString()
              }, { onConflict: 'id' });

            if (!error) {
              gravouSupabase = true;
            } else {
              erroSupabase = error.message;
              console.error('[Supabase POST] Erro upsert:', error.message);
            }
          } catch (supErr) {
            erroSupabase = supErr.message;
            console.error('[Supabase POST] Erro de rede:', supErr.message);
          }
        }

        // Garantia de persistência durável: nunca retorna 200 se a gravação falhou
        if (!gravouLocal && !gravouSupabase) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Falha crítica: Não foi possível gravar as alterações nem em disco nem no banco de dados.',
            details: erroSupabase
          }));
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(JSON.stringify({
          success: true,
          message: 'Dados salvos com sucesso!',
          version: nextVersion,
          savedAt: parsed.savedAt,
          savedLocally: gravouLocal,
          savedRemotely: gravouSupabase
        }));
      } catch (err) {
        if (err.message === 'PAYLOAD_TOO_LARGE') {
          res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'Corpo da requisição excede o limite máximo permitido (2MB).' }));
        }
        console.error('[SenaClube] Erro ao salvar POST /api/bolao:', err);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Erro no processamento da requisição', details: err.message }));
      }
      return;
    }
  }

  // --- Servir arquivos estáticos com proteção de path traversal ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acesso Proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
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
  console.log(`[SenaClube] Servidor ativo e protegido em http://localhost:${PORT}`);
});
