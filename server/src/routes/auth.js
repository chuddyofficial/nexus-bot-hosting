const express = require('express');
const { randomBytes } = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { signToken } = require('../services/authService');
const emailService = require('../services/emailService');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function validateSignup({ email, password, displayName, username }) {
  if (!email || !EMAIL_RE.test(email)) return 'A valid email address is required.';
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!displayName || displayName.trim().length < 2) return 'Display name must be at least 2 characters.';
  if (username && !USERNAME_RE.test(username)) return 'Username must be 3-32 characters (letters, numbers, ._-).';
  return null;
}

router.post('/signup', authLimiter, async (req, res) => {
  const { email, password, displayName, username } = req.body || {};
  const error = validateSignup({ email, password, displayName, username });
  if (error) return res.status(400).json({ error });

  if (User.getUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }
  if (username && User.getUserByUsername(username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const user = User.createUser({ email, password, displayName: displayName.trim(), username: username || null });
  const token = signToken(user);

  const clientOrigin = process.env.CLIENT_ORIGIN || 'https://bot.chnexus.net';
  const verifyUrl = `${clientOrigin}/verify-email?token=${user.verify_token}`;
  emailService.sendWelcomeEmail(user, verifyUrl).catch((e) => console.error('email error', e));

  res.status(201).json({ token, user: User.toPublic(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = User.getUserByEmailOrUsername(email);
  if (!user || !User.verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.disabled) {
    return res.status(403).json({ error: 'This account has been disabled.' });
  }

  const token = signToken(user);
  res.json({ token, user: User.toPublic(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: User.toPublic(req.user) });
});

router.post('/verify-email', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });

  const user = User.getUserByVerifyToken(token);
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification link.' });

  User.markEmailVerified(user.id);
  res.json({ ok: true });
});

router.post('/request-password-reset', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  const user = email ? User.getUserByEmail(email) : null;

  if (user) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000;
    User.setResetToken(user.id, token, expiresAt);
    const clientOrigin = process.env.CLIENT_ORIGIN || 'https://bot.chnexus.net';
    const resetUrl = `${clientOrigin}/reset-password?token=${token}`;
    emailService.sendPasswordResetEmail(user, resetUrl).catch((e) => console.error('email error', e));
  }

  // Always respond the same way so we don't leak which emails are registered.
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});

router.post('/reset-password', authLimiter, (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ error: 'A valid token and an 8+ character password are required.' });
  }

  const user = User.getUserByResetToken(token);
  if (!user) return res.status(400).json({ error: 'Invalid or expired reset link.' });

  User.updatePassword(user.id, password);
  res.json({ ok: true });
});

module.exports = router;
