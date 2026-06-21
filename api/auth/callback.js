// api/auth/callback.js
// Paso 2 del OAuth flow: recibe el code de GitHub, verifica el usuario y crea la sesión

const {
  parseCookies,
  createSessionToken,
  buildSessionCookie,
  getBaseUrl,
} = require('./_utils');

module.exports = async function handler(req, res) {
  const { code, state } = req.query;
  const cookies = parseCookies(req);
  const storedState = cookies['oauth-state'];

  // Verificación CSRF: el state debe coincidir con el de la cookie
  if (!state || !storedState || state !== storedState) {
    return res.status(400).send(`
      <html><body style="font-family:serif;text-align:center;padding:4rem">
        <h2>Error de seguridad</h2>
        <p>El state OAuth no coincide. <a href="/login">Vuelve a intentarlo</a>.</p>
      </body></html>
    `);
  }

  if (!code) {
    return res.status(400).send('Código OAuth ausente.');
  }

  try {
    const baseUrl = getBaseUrl(req);

    // 1. Intercambiar el code por un access token de GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${baseUrl}/api/auth/callback`,
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('GitHub OAuth error:', tokenData);
      return res.status(400).send('No se pudo obtener el access token de GitHub.');
    }

    // 2. Obtener el perfil del usuario con el access token
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'ChronosRSS',
      },
    });

    const user = await userRes.json();

    // 3. Verificar que el usuario es el autorizado
    const allowedUser = process.env.ALLOWED_GITHUB_USER;
    if (!allowedUser || user.login !== allowedUser) {
      return res.status(403).send(`
        <html><body style="font-family:serif;text-align:center;padding:4rem;background:#faf8f3">
          <h2 style="font-size:1.5rem">Acceso denegado</h2>
          <p>Tu cuenta de GitHub (<strong>${user.login}</strong>) no tiene acceso a esta aplicación.</p>
          <a href="/login" style="color:#c0392b">← Volver</a>
        </body></html>
      `);
    }

    // 4. Crear token de sesión firmado y setear como cookie HttpOnly
    const sessionToken = createSessionToken(user.login);

    res.setHeader('Set-Cookie', [
      buildSessionCookie(sessionToken),
      // Limpiar la cookie temporal de oauth-state
      'oauth-state=; HttpOnly; Path=/api/auth/callback; Max-Age=0',
    ]);

    // 5. Redirigir a la app
    res.redirect(302, '/');
  } catch (err) {
    console.error('Error en callback OAuth:', err);
    res.status(500).send('Error interno durante la autenticación. Inténtalo de nuevo.');
  }
};
