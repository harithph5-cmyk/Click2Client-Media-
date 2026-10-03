// Outbound notifications (email via Resend, lead webhook). Every function
// fails soft: a notification problem never breaks an audit or a form.

import { config } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sendEmail({ to, subject, html }) {
  if (!config.email.resendApiKey || !config.email.from || !to) return { sent: false, reason: 'not_configured' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.email.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to: [to], subject, html }),
      signal: AbortSignal.timeout(15000),
    });
    return { sent: r.ok, reason: r.ok ? null : `HTTP ${r.status}` };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

export function reportReadyEmail({ to, name, website, score, link, tierName }) {
  return sendEmail({
    to,
    subject: `Your ${tierName} for ${website} is ready`,
    html: `<p>Hi ${esc(name || 'there')},</p><p>Your <b>${esc(tierName)}</b> for <b>${esc(website)}</b> is ready. Overall SEO score: <b>${esc(score)}/100</b>.</p><p><a href="${esc(link)}">Open your SEO audit dashboard</a></p><p>Need help fixing the issues? Just reply to this email.</p><p>— Click2Client Media</p>`,
  });
}

export function notifyOwner(subject, lines) {
  if (!config.email.notifyTo) return;
  sendEmail({ to: config.email.notifyTo, subject, html: lines.map((l) => `<p>${esc(l)}</p>`).join('') });
}

export function forwardLead(lead, onOk) {
  if (!config.leads.webhookUrl) return;
  fetch(config.leads.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...lead, createdAt: new Date().toISOString() }), signal: AbortSignal.timeout(10000) })
    .then((r) => r.ok && onOk?.())
    .catch(() => {});
}
