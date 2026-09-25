import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sena2026!';
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET_KEY || 'sena-clube-jwt-secret-salt-2026';

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch {}
}

let cachedAuth = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto em cache

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
 * Carrega as credenciais salvas (Supabase com fallback para arquivo local)
 * @param {boolean} forceReload 
 * @returns {Promise<{ username: string, passwordHash: string, salt: string, updatedAt: string } | null>}
 */
export async function loadStoredCredentials(forceReload = false) {
  if (!forceReload && cachedAuth && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cachedAuth;
  }

  // 1. Tenta carregar do Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('bolao_data')
        .select('*')
        .eq('id', 'sena_clube_admin_auth')
        .maybeSingle();

      if (!error && data && data.estado_json && data.estado_json.passwordHash) {
        cachedAuth = data.estado_json;
        cacheTime = Date.now();
        // Sincroniza localmente se possível
        try {
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(AUTH_FILE, JSON.stringify(cachedAuth, null, 2), 'utf-8');
        } catch {}
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
        cachedAuth = parsed;
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
 * Persiste as novas credenciais no Supabase e em arquivo local
 * @param {{ username: string, passwordHash: string, salt: string, updatedAt: string }} credentials 
 */
export async function saveStoredCredentials(credentials) {
  cachedAuth = credentials;
  cacheTime = Date.now();

  // 1. Salva localmente (se ambiente permitir escrita)
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(credentials, null, 2), 'utf-8');
  } catch {}

  // 2. Salva no Supabase (para persistência serverless/Vercel)
  if (supabase) {
    try {
      const { error } = await supabase
        .from('bolao_data')
        .upsert({
          id: 'sena_clube_admin_auth',
          nome_bolao: 'Admin Credentials',
          estado_json: credentials,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) {
        console.error('[Auth Supabase] Erro ao salvar credenciais:', error.message);
      }
    } catch (supErr) {
      console.error('[Auth Supabase] Erro de rede ao salvar credenciais:', supErr.message);
    }
  }
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

  const newCredentials = {
    username: cleanUser,
    passwordHash: hash,
    salt,
    updatedAt: now
  };

  await saveStoredCredentials(newCredentials);

  const newToken = generateToken();
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
 * @returns {string}
 */
export function generateToken() {
  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 dias de validade
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('base64url');
  return `${str}.${sig}`;
}

/**
 * Valida a autenticidade e validade temporal do token de sessão
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

    return true;
  } catch {
    return false;
  }
}
