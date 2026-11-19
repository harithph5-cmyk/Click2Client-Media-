// Inbound lead capture. All three endpoints are public URLs, so each is
// authenticated: a shared token (generic), or Meta's HMAC signature (WhatsApp
// Cloud API, Meta Lead Ads). Secrets live only in environment variables.

import crypto from 'node:crypto';
import express from 'express';
import * as store from '../store/db.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function signed(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !req.rawBody) return false;
  const want = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  return same(req.get('x-hub-signature-256') || '', want);
}

export function webhookRouter(h, saveLead) {
  const r = express.Router();
  const verify = (envName) => (req, res) => {
    const t = process.env[envName];
    if (t && req.query['hub.mode'] === 'subscribe' && same(req.query['hub.verify_token'] || '', t)) return res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
    res.sendStatus(403);
  };

  // Generic: Zapier, Make, Google Sheets Apps Script, any form tool.
  r.post('/lead', h(async (req, res) => {
    const t = process.env.LEAD_WEBHOOK_TOKEN;
    if (!t || !same(req.get('x-webhook-token') || '', t)) return res.sendStatus(401);
    const b = req.body || {};
    const l = { name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 25), whatsapp: clean(b.phone, 25), company: clean(b.company, 160), website: clean(b.website, 300), service: clean(b.service, 160), message: clean(b.message, 2000), source: clean(b.source, 40) || 'webhook' };
    if (!l.name && !l.phone && !l.email) return res.status(400).json({ error: { code: 'invalid', message: 'name, phone or email is required' } });
    res.status(201).json({ id: await saveLead(l) });
  }));

  // WhatsApp Business Cloud API: an inbound message from a new number becomes a lead.
  r.get('/whatsapp', verify('WHATSAPP_VERIFY_TOKEN'));
  r.post('/whatsapp', h(async (req, res) => {
    if (!signed(req)) return res.sendStatus(401);
    for (const e of req.body?.entry || []) for (const c of e.changes || []) {
      const v = c.value || {};
      for (const m of v.messages || []) {
        const phone = clean(m.from, 20);
        const name = clean(v.contacts?.find((x) => x.wa_id === phone)?.profile?.name, 120);
        const text = clean(m.text?.body || `(${m.type} message)`, 1000);
        const existing = await store.queryOne("SELECT id FROM leads WHERE source = 'whatsapp' AND phone = ? AND created_at > ? LIMIT 1", [phone, new Date(Date.now() - 30 * 864e5).toISOString()]);
        if (existing) await store.query("INSERT INTO activities (id, type, subject, body, entity_type, entity_id, actor) VALUES (?, 'whatsapp', 'WhatsApp message received', ?, 'lead', ?, 'WhatsApp')", [store.newId(8), text, existing.id]);
        else await saveLead({ name: name || phone, phone, whatsapp: phone, message: text, service: 'WhatsApp enquiry', source: 'whatsapp' });
      }
    }
    res.sendStatus(200);
  }));

  // Meta Lead Ads: the webhook only carries a lead id; details are fetched with META_PAGE_TOKEN.
  r.get('/meta', verify('META_VERIFY_TOKEN'));
  r.post('/meta', h(async (req, res) => {
    if (!signed(req)) return res.sendStatus(401);
    for (const e of req.body?.entry || []) for (const c of e.changes || []) {
      if (c.field !== 'leadgen') continue;
      const id = clean(c.value?.leadgen_id, 40);
      if (!id || await store.queryOne("SELECT 1 AS x FROM leads WHERE source = 'meta_ads' AND message LIKE ?", [`%[meta:${id}]%`])) continue;
      let f = {};
      try {
        if (process.env.META_PAGE_TOKEN) {
          const j = await (await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=field_data,ad_name,campaign_name`, { headers: { authorization: `Bearer ${process.env.META_PAGE_TOKEN}` }, signal: AbortSignal.timeout(10000) })).json();
          for (const x of j.field_data || []) f[x.name] = clean(x.values?.[0], 300);
          f._campaign = clean(j.campaign_name || j.ad_name, 120);
        }
      } catch (err) { console.error('[meta-leads]', err.message); }
      await saveLead({ name: f.full_name || f.first_name || 'Meta lead', email: (f.email || '').toLowerCase(), phone: f.phone_number || f.phone, whatsapp: f.phone_number || f.phone, company: f.company_name, service: f._campaign ? `Meta Ads: ${f._campaign}` : 'Meta Ads lead', message: `${process.env.META_PAGE_TOKEN ? '' : 'Connect META_PAGE_TOKEN to import the form answers. '}[meta:${id}]`, source: 'meta_ads' });
    }
    res.sendStatus(200);
  }));
  return r;
}
