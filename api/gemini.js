// api/gemini.js
// Proxy seguro para la API de Gemini.
// La API key NUNCA sale al cliente — vive en las variables de entorno de Vercel.

const { parseCookies, verifySessionToken } = require('./auth/_utils');

module.exports = async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Verificar sesión activa
  const cookies = parseCookies(req);
  const session = verifySessionToken(cookies['chronos-session']);
  if (!session) {
    return res.status(401).json({ error: 'No autenticado. Por favor inicia sesión.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY no configurada en las variables de entorno de Vercel');
    return res.status(500).json({ error: 'API de IA no configurada en el servidor.' });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return res.status(response.status).json({
        error: `Error de la API de Gemini: ${response.status}`,
        detail: data?.error?.message || 'Sin detalle',
      });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('Error en el proxy de Gemini:', err);
    res.status(500).json({ error: 'Error interno al contactar con la IA.' });
  }
};
