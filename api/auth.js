import { checkPassword, generateToken } from './_auth.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const password = body.password || body.senha;

    if (!password || !checkPassword(password)) {
      return res.status(401).json({
        success: false,
        error: 'Credencial inválida. Acesso de administrador não autorizado.'
      });
    }

    const token = generateToken();
    return res.status(200).json({
      success: true,
      message: 'Autenticado com sucesso!',
      token
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Requisição inválida',
      details: err.message
    });
  }
}
