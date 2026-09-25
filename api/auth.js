import {
  verifyAdminLogin,
  generateToken,
  verifyToken,
  updateAdminCredentials,
  getAdminProfile
} from './_auth.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- GET: Perfil do Administrador ---
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || req.headers['authorization'] || '';
    if (!verifyToken(authHeader)) {
      return res.status(401).json({
        success: false,
        error: 'Acesso não autorizado. Token de administrador ausente ou inválido.'
      });
    }

    try {
      const profile = await getAdminProfile();
      return res.status(200).json({ success: true, profile });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Parse Body
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (parseErr) {
    return res.status(400).json({ success: false, error: 'JSON inválido' });
  }

  // --- PUT ou POST de Alteração de Credenciais ---
  const isChangeAction = req.method === 'PUT' || (req.method === 'POST' && (body.action === 'change-credentials' || body.currentPassword || body.senhaAtual));

  if (isChangeAction) {
    const authHeader = req.headers.authorization || req.headers['authorization'] || '';
    if (!verifyToken(authHeader)) {
      return res.status(401).json({
        success: false,
        error: 'É necessário estar logado como administrador para alterar as credenciais de acesso.'
      });
    }

    try {
      const currentPassword = body.currentPassword || body.senhaAtual;
      const newUsername = body.newUsername || body.novoUsuario;
      const newPassword = body.newPassword || body.novaSenha;

      const result = await updateAdminCredentials({ currentPassword, newUsername, newPassword });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Erro ao atualizar credenciais', details: err.message });
    }
  }

  // --- POST: Login Normal de Administrador ---
  if (req.method === 'POST') {
    try {
      const username = body.username || body.usuario || 'admin';
      const password = body.password || body.senha;

      if (!password) {
        return res.status(400).json({
          success: false,
          error: 'A senha é obrigatória.'
        });
      }

      const isValid = await verifyAdminLogin(username, password);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Credencial inválida. Usuário ou senha incorretos.'
        });
      }

      const token = generateToken();
      return res.status(200).json({
        success: true,
        message: 'Autenticado com sucesso!',
        token,
        username
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Erro no servidor de autenticação',
        details: err.message
      });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
