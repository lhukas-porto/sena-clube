import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sena2026!';
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET_KEY || 'sena-clube-jwt-secret-salt-2026';

/**
 * Valida a senha informada contra a senha mestra do sistema
 * @param {string} password 
 * @returns {boolean}
 */
export function checkPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.trim() === ADMIN_PASSWORD.trim();
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
  
  // Suporta passagem direta do token ou via formato "Bearer <token>"
  let token = authHeaderOrToken.trim();
  if (token.startsWith('Bearer ')) {
    token = token.substring(7).trim();
  }

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [str, sig] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('base64url');
    // Prevenção de timing attack na comparação da assinatura
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
