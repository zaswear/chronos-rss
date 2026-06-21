// api/auth/logout.js
// Invalida la sesión borrando la cookie y redirige al login

module.exports = function handler(req, res) {
  // Borrar la cookie de sesión estableciendo Max-Age=0
  res.setHeader(
    'Set-Cookie',
    'chronos-session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  );
  res.redirect(302, '/login');
};
