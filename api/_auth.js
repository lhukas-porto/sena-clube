import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
let JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET_KEY;

if (isProduction) {
  if (!ADMIN_PASSWORD) {
    console.warn('[Segurança Crítica] ADMIN_PASSWORD não configurada em produção! Usando valor temporário.');
  }
  if (!JWT_SECRET) {
    console.warn('[Segurança Crítica] JWT_SECRET não configurada em produção! Usando valor temporário.');
  }
}

ADMIN_PASSWORD = ADMIN_PASSWORD || 'sena2026!';
JWT_SECRET = JWT_SECRET || 'sena-clube-jwt-secret-salt-2026';

// Supabase Client (prefere service_role para operações de backend)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.warn('[Auth] Falha ao inicializar Supabase client:', err.message);
  }
}

let cachedAuth = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto em cache

// Controle de taxa de tentativas de login (Rate Limiting)
const LOGIN_ATTEMPTS = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_PERIOD_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Verifica se o IP / identificador excedeu o limite de tentativas
 * @param {string} identifier 
 * @returns {{ allowed: boolean, remainingSeconds?: number, error?: string }}
 */
export function checkRateLimit(identifier) {
  const key = identifier || 'global';
  const record = LOGIN_ATTEMPTS.get(key);
  if (!record) return { allowed: true };

  const now = Date.now();
  if (now - record.firstAttempt > LOCKOUT_PERIOD_MS) {
    LOGIN_ATTEMPTS.delete(key);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const remainingSeconds = Math.ceil((record.firstAttempt + LOCKOUT_PERIOD_MS - now) / 1000);
    return {
      allowed: false,
      remainingSeconds,
      error: `Muitas tentativas de login incorretas. Aguarde ${remainingSeconds} segundos antes de tentar novamente.`
    };
  }

  return { allowed: true };
}

/**
 * Registra o resultado da tentativa de login
 * @param {string} identifier 
 * @param {boolean} success 
 */
export function recordLoginAttempt(identifier, success) {
  const key = identifier || 'global';
  if (success) {
    LOGIN_ATTEMPTS.delete(key);
    return;
  }
  const now = Date.now();
  const record = LOGIN_ATTEMPTS.get(key);
  if (!record || (now - record.firstAttempt > LOCKOUT_PERIOD_MS)) {
    LOGIN_ATTEMPTS.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

/**
 * Limpa o histórico de rate limit (útil para testes)
 */
export function resetRateLimit() {
  LOGIN_ATTEMPTS.clear();
}

/**
 * Gera hash criptográfico Scrypt com salt aleatório
 * @param {string} password 
 * @param {string|null} salt 
 * @returns {{ hash: string, salt: string }}
 */
export function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

/**
 * Validação segura de hash contra timing-attacks
 * @param {string} password 
 * @param {string} storedHash 
 * @param {string} salt 
 * @returns {boolean}
 */
export function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  try {
    const { hash } = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Carrega as credenciais salvas (Supabase admin_auth com fallback seguro)
 * @param {boolean} forceReload 
 * @returns {Promise<{ username: string, passwordHash: string, salt: string, tokenVersion: number, updatedAt: string } | null>}
 */
export async function loadStoredCredentials(forceReload = false) {
  if (!forceReload && cachedAuth && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cachedAuth;
  }

  // 1. Tenta carregar da tabela privada 'admin_auth' do Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('admin_auth')
        .select('*')
        .eq('id', 'sena_clube_admin_auth')
        .maybeSingle();

      if (!error && data && data.password_hash) {
        cachedAuth = {
          username: data.username || 'admin',
          passwordHash: data.password_hash,
          salt: data.salt,
          tokenVersion: data.token_version || 1,
          updatedAt: data.updated_at
        };
        cacheTime = Date.now();

        // Sincroniza localmente se possível
        try {
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(AUTH_FILE, JSON.stringify(cachedAuth, null, 2), 'utf-8');
        } catch {}
        return cachedAuth;
      }

      // Fallback de transição para a tabela antiga bolao_data caso a migration ainda esteja pendente
      const { data: legacyData } = await supabase
        .from('bolao_data')
        .select('*')
        .eq('id', 'sena_clube_admin_auth')
        .maybeSingle();

      if (legacyData && legacyData.estado_json && legacyData.estado_json.passwordHash) {
        cachedAuth = {
          username: legacyData.estado_json.username || 'admin',
          passwordHash: legacyData.estado_json.passwordHash,
          salt: legacyData.estado_json.salt,
          tokenVersion: legacyData.estado_json.tokenVersion || 1,
          updatedAt: legacyData.estado_json.updatedAt || legacyData.updated_at
        };
        cacheTime = Date.now();
        return cachedAuth;
      }
    } catch (err) {
      console.warn('[Auth] Aviso ao buscar credenciais no Supabase:', err.message);
    }
  }

  // 2. Fallback arquivo local (ambiente dev/offline)
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const content = fs.readFileSync(AUTH_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.passwordHash) {
        cachedAuth = {
          username: parsed.username || 'admin',
          passwordHash: parsed.passwordHash,
          salt: parsed.salt,
          tokenVersion: parsed.tokenVersion || 1,
          updatedAt: parsed.updatedAt || new Date().toISOString()
        };
        cacheTime = Date.now();
        return cachedAuth;
      }
    }
  } catch (err) {
    console.warn('[Auth] Aviso ao ler arquivo local de credenciais:', err.message);
  }

  return null;
}

/**
 * Persiste as novas credenciais no Supabase (admin_auth) e em arquivo local
 * @param {{ username: string, passwordHash: string, salt: string, tokenVersion?: number, updatedAt: string }} credentials 
 */
export async function saveStoredCredentials(credentials) {
  cachedAuth = credentials;
  cacheTime = Date.now();

  let gravouLocal = false;
  let gravouRemoto = false;
  let erroRemoto = null;

  // 1. Salva localmente (se ambiente permitir escrita)
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(credentials, null, 2), 'utf-8');
    gravouLocal = true;
  } catch {}

  // 2. Salva no Supabase (tabela privada admin_auth)
  if (supabase) {
    try {
      const { error } = await supabase
        .from('admin_auth')
        .upsert({
          id: 'sena_clube_admin_auth',
          username: credentials.username,
          password_hash: credentials.passwordHash,
          salt: credentials.salt,
          token_version: credentials.tokenVersion || 1,
          updated_at: credentials.updatedAt
        }, { onConflict: 'id' });

      if (!error) {
        gravouRemoto = true;
        // Limpa registro antigo de bolao_data caso ainda exista
        try {
          await supabase.from('bolao_data').delete().eq('id', 'sena_clube_admin_auth');
        } catch {}
      } else {
        erroRemoto = error.message;
        console.error('[Auth Supabase] Erro ao salvar credenciais em admin_auth:', error.message);
      }
    } catch (supErr) {
      erroRemoto = supErr.message;
      console.error('[Auth Supabase] Erro de rede ao salvar credenciais:', supErr.message);
    }
  }

  // Se nenhum dos destinos conseguiu gravar, lançar erro para não emitir falso sucesso
  if (!gravouLocal && !gravouRemoto) {
    throw new Error(`Falha crítica de persistência de credenciais: ${erroRemoto || 'Nenhum meio de armazenamento durável disponível.'}`);
  }

  return { gravouLocal, gravouRemoto };
}

/**
 * Validação de login com suporte a usuário e senha customizados
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<boolean>}
 */
export async function verifyAdminLogin(username, password) {
  if (!password || typeof password !== 'string') return false;

  const stored = await loadStoredCredentials();
  if (stored) {
    const expectedUser = (stored.username || 'admin').trim().toLowerCase();
    const providedUser = (username || 'admin').trim().toLowerCase();
    if (providedUser !== expectedUser) return false;

    return verifyPassword(password.trim(), stored.passwordHash, stored.salt);
  }

  // Fallback padrão se nenhuma credencial customizada foi definida ainda
  const providedUser = (username || 'admin').trim().toLowerCase();
  const defaultPass = ADMIN_PASSWORD.trim();
  return (providedUser === 'admin') && (password.trim() === defaultPass);
}

/**
 * Valida a senha informada de forma síncrona (compatibilidade)
 * @param {string} password 
 * @returns {boolean}
 */
export function checkPassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (cachedAuth && cachedAuth.passwordHash && cachedAuth.salt) {
    return verifyPassword(password.trim(), cachedAuth.passwordHash, cachedAuth.salt);
  }
  return password.trim() === ADMIN_PASSWORD.trim();
}

/**
 * Atualiza o login e a senha do administrador após conferir a senha atual
 * @param {{ currentPassword: string, newUsername?: string, newPassword?: string }} param0 
 * @returns {Promise<{ success: boolean, message?: string, error?: string, token?: string, username?: string, updatedAt?: string }>}
 */
export async function updateAdminCredentials({ currentPassword, newUsername, newPassword }) {
  if (!currentPassword || typeof currentPassword !== 'string') {
    return { success: false, error: 'A senha atual é obrigatória para autorizar qualquer alteração.' };
  }

  const stored = await loadStoredCredentials(true);
  const currentExpectedUser = stored ? stored.username : 'admin';
  const isCurrentPassValid = stored
    ? verifyPassword(currentPassword.trim(), stored.passwordHash, stored.salt)
    : (currentPassword.trim() === ADMIN_PASSWORD.trim());

  if (!isCurrentPassValid) {
    return { success: false, error: 'Senha atual incorreta. Confirme sua senha de acesso.' };
  }

  const cleanUser = (newUsername || currentExpectedUser || 'admin').trim();
  if (cleanUser.length < 3) {
    return { success: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
    return { success: false, error: 'O nome de usuário deve conter apenas letras, números, pontos e hífens.' };
  }

  const cleanPass = (newPassword || '').trim();
  if (cleanPass.length < 6) {
    return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
  }

  const { hash, salt } = hashPassword(cleanPass);
  const now = new Date().toISOString();
  const nextTokenVersion = (stored && typeof stored.tokenVersion === 'number' ? stored.tokenVersion : 1) + 1;

  const newCredentials = {
    username: cleanUser,
    passwordHash: hash,
    salt,
    tokenVersion: nextTokenVersion,
    updatedAt: now
  };

  try {
    await saveStoredCredentials(newCredentials);
  } catch (err) {
    return { success: false, error: `Erro ao salvar credenciais: ${err.message}` };
  }

  const newToken = generateToken(nextTokenVersion, now);
  return {
    success: true,
    message: 'Credenciais do administrador atualizadas com sucesso!',
    token: newToken,
    username: cleanUser,
    updatedAt: now
  };
}

/**
 * Obtém informações públicas do perfil administrativo (sem segredos)
 * @returns {Promise<{ username: string, updatedAt: string | null, isCustomized: boolean }>}
 */
export async function getAdminProfile() {
  const stored = await loadStoredCredentials();
  return {
    username: stored ? (stored.username || 'admin') : 'admin',
    updatedAt: stored ? stored.updatedAt : null,
    isCustomized: !!stored
  };
}

/**
 * Gera um token de sessão assinado com HMAC-SHA256 válido por 7 dias
 * Inclui versão do token (tv) e data de corte para revogação em troca de senha
 * @param {number} tokenVersion 
 * @param {string|null} updatedAt 
 * @returns {string}
 */
export function generateToken(tokenVersion = 1, updatedAt = null) {
  const payload = {
    role: 'admin',
    tv: tokenVersion,
    upd: updatedAt || (cachedAuth ? cachedAuth.updatedAt : null),
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 dias de validade
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('base64url');
  return `${str}.${sig}`;
}

/**
 * Valida a autenticidade e validade temporal do token de sessão.
 * Rejeita tokens emitidos antes da última alteração de credenciais (revogação ativa).
 * @param {string} authHeaderOrToken 
 * @returns {boolean}
 */
export function verifyToken(authHeaderOrToken) {
  if (!authHeaderOrToken || typeof authHeaderOrToken !== 'string') return false;

  let token = authHeaderOrToken.trim();
  if (token.startsWith('Bearer ')) {
    token = token.substring(7).trim();
  }

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [str, sig] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf-8'));
    if (payload.role !== 'admin') return false;
    if (Date.now() > payload.exp) return false;

    // Revogação de sessões antigas: se houver credenciais atualizadas
    if (cachedAuth && cachedAuth.updatedAt) {
      const authUpdateMs = new Date(cachedAuth.updatedAt).getTime();
      // Se o token foi emitido antes da última atualização de senha (com tolerância de 2s para skew)
      if (payload.iat && (payload.iat + 2000 < authUpdateMs)) {
        return false;
      }
      if (typeof cachedAuth.tokenVersion === 'number' && typeof payload.tv === 'number') {
        if (payload.tv < cachedAuth.tokenVersion) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}
