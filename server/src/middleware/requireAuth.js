const { verifyToken } = require('../services/authService');
const { getUserById } = require('../models/User');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = verifyToken(token);
    const user = getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.disabled) return res.status(403).json({ error: 'This account has been disabled.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
