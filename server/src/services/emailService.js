const { Resend } = require('resend');

let resendClient = null;
function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const FROM = process.env.EMAIL_FROM || 'Nexus Bot Hosting <noreply@chnexus.net>';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'https://bot.chnexus.net';

async function send({ to, subject, html }) {
  const client = getClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not set - skipping email to ${to}: "${subject}"`);
    return { skipped: true };
  }
  try {
    return await client.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { error: err.message };
  }
}

function shell(title, bodyHtml) {
  return `
  <div style="background:#0B0E14;padding:40px 20px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#131722;border-radius:12px;overflow:hidden;border:1px solid #22273a;">
      <div style="padding:28px 32px 0 32px;">
        <div style="font-size:20px;font-weight:700;color:#E6E8EE;letter-spacing:0.5px;">
          NEXUS <span style="color:#6C5CE7;">BOT HOSTING</span>
        </div>
      </div>
      <div style="padding:24px 32px 32px 32px;color:#B7BCCB;font-size:15px;line-height:1.6;">
        <h2 style="color:#E6E8EE;font-size:20px;margin:0 0 16px 0;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:16px 32px;background:#0F1320;color:#5B6178;font-size:12px;">
        Nexus Bot Hosting &middot; bot.chnexus.net
      </div>
    </div>
  </div>`;
}

async function sendWelcomeEmail(user, verifyUrl) {
  const html = shell('Welcome to Nexus Bot Hosting!', `
    <p>Hey ${escapeHtml(user.displayName)},</p>
    <p>Thanks for signing up. Your account has been created and you can now host up to
    <strong>5 bots</strong> (Python or Node.js) for free.</p>
    ${verifyUrl ? `
    <p>Please confirm your email address to activate your account:</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${verifyUrl}" style="background:#6C5CE7;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block;">Verify Email</a>
    </p>
    <p style="font-size:13px;color:#5B6178;">Or paste this link into your browser: <br/>${verifyUrl}</p>
    ` : ''}
    <p>Once verified, head to your dashboard to create your first bot.</p>
  `);
  return send({ to: user.email, subject: 'Welcome to Nexus Bot Hosting - Verify your email', html });
}

async function sendPasswordResetEmail(user, resetUrl) {
  const html = shell('Reset your password', `
    <p>Hey ${escapeHtml(user.displayName)},</p>
    <p>We received a request to reset your Nexus Bot Hosting password. This link expires in 1 hour.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" style="background:#6C5CE7;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block;">Reset Password</a>
    </p>
    <p style="font-size:13px;color:#5B6178;">If you didn't request this, you can safely ignore this email.</p>
  `);
  return send({ to: user.email, subject: 'Reset your Nexus Bot Hosting password', html });
}

async function sendBotCreatedEmail(user, bot) {
  const html = shell('Your bot is ready', `
    <p>Hey ${escapeHtml(user.displayName)},</p>
    <p>Your ${bot.runtime === 'python' ? 'Python' : 'Node.js'} bot "<strong>${escapeHtml(bot.name)}</strong>" has been created.</p>
    <p>Upload your files from the dashboard to get it running.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${CLIENT_ORIGIN}/bots/${bot.id}" style="background:#6C5CE7;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block;">Open Bot Dashboard</a>
    </p>
  `);
  return send({ to: user.email, subject: `Your bot "${bot.name}" is ready`, html });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = {
  send,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendBotCreatedEmail
};
