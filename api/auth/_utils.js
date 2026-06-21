// Utilidades compartidas para autenticación de Chronos RSS
// Usadas por callback.js, me.js, gemini.js, logout.js

const crypto = require('crypto');

/**
 * Parsea el header Cookie en un objeto key→value
 */
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const value = decodeURIComponent(parts.join('=').trim());
    if (key) list[key] = value;
  });
  return list;
}

/**
 * Crea un token de sesión firmado con HMAC-SHA256
 * Formato (Base64): username:expiry:signature
 */
function createSessionToken(username) {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
  const data = `${username}:${expiry}`;
  const sig = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(data)
    .digest('hex');
  return Buffer.from(`${data}:${sig}`).toString('base64url');
}

/**
 * Verifica un token de sesión. Devuelve { username } o null si inválido/expirado.
 */
function verifySessionToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);

    const username = decoded.slice(0, secondLastColon);
    const expiry = parseInt(decoded.slice(secondLastColon + 1, lastColon), 10);
    const sig = decoded.slice(lastColon + 1);

    if (!username || isNaN(expiry) || !sig) return null;
    if (Date.now() > expiry) return null; // Expirado

    const data = `${username}:${expiry}`;
    const expectedSig = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(data)
      .digest('hex');

    // Comparación segura (previene timing attacks)
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    return { username };
  } catch {
    return null;
  }
}

/**
 * Obtiene la URL base de la request (para redirect_uri)
 */
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Construye el header Set-Cookie para la sesión
 */
function buildSessionCookie(token, maxAge = 7 * 24 * 60 * 60) {
  return `chronos-session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`;
}

module.exports = {
  parseCookies,
  createSessionToken,
  verifySessionToken,
  getBaseUrl,
  buildSessionCookie,
};
