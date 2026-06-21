// api/auth/me.js
// Endpoint ligero para que el frontend verifique si hay sesión activa

const { parseCookies, verifySessionToken } = require('./_utils');

module.exports = function handler(req, res) {
  const cookies = parseCookies(req);
  const token = cookies['chronos-session'];
  const session = verifySessionToken(token);

  if (!session) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  res.status(200).json({ username: session.username });
};
