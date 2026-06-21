// api/auth/github.js
// Paso 1 del OAuth flow: genera state CSRF y redirige a GitHub

const crypto = require('crypto');
const { getBaseUrl } = require('./_utils');

module.exports = function handler(req, res) {
  // Generar un state aleatorio para prevenir CSRF
  const state = crypto.randomBytes(16).toString('hex');

  // Guardar el state en cookie temporal (10 minutos)
  res.setHeader(
    'Set-Cookie',
    `oauth-state=${state}; HttpOnly; Path=/api/auth/callback; SameSite=Lax; Max-Age=600`
  );

  const callbackUrl = `${getBaseUrl(req)}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl,
    scope: 'read:user',
    state,
  });

  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
