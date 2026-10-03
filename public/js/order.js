// Paid audit order page: QR payment → WhatsApp screenshot → manual
// verification by the Click2Client team → audit unlocks.
// The amount shown always comes from the server.

import { api, esc, fmtDate, ICON } from './common.js';

const view = document.getElementById('view');
const token = location.pathname.split('/').pop();
let poll;

const STEPS = [
  ['details', 'Details received', 'Your website and contact details are saved.'],
  ['pay', 'Scan & pay', 'Pay with any UPI app using the QR code.'],
  ['screenshot', 'Send payment screenshot', 'Share the payment confirmation on WhatsApp.'],
  ['verify', 'Payment verification', 'Our team confirms the payment manually.'],
  ['audit', 'Audit & report', 'Your audit runs and the dashboard unlocks.'],
];

function stage(o) {
  if (o.paymentStatus === 'verified') return o.auditStatus === 'complete' ? 5 : 4;
  if (o.paymentStatus === 'screenshot_received' || o.paymentStatus === 'under_verification') return 3;
  return 1;
}

function render(o) {
  const st = stage(o);
  const chip = { pending: ['pending', 'Payment Pending'], screenshot_received: ['verifying', 'Under Verification'], under_verification: ['verifying', 'Under Verification'], verified: ['verified', 'Payment Verified'], rejected: ['rejected', 'Payment Rejected'] }[o.paymentStatus];
  let main;
  if (o.paymentStatus === 'pending') {
    main = `
      <div class="pay-steps" aria-hidden="true"><span class="on"></span><span class="on"></span><span></span></div>
      <span class="eyebrow">Step 2 of 3</span>
      <h2 style="font:700 26px var(--display);margin:6px 0 4px;letter-spacing:-0.02em">Scan &amp; Pay ₹${o.amount}</h2>
      <p class="small">${esc(o.planName)} · one-time payment</p>
      <div class="qr-box" style="margin-top:18px">
        ${o.qrAvailable ? `<img src="/api/public/payment-qr" alt="Click2Client Media UPI payment QR code" width="240" height="240">` : `<div style="text-align:center;padding:30px 10px"><b style="color:var(--ink)">QR code not configured yet</b><p class="small" style="margin-top:6px">Please message us on WhatsApp for payment details.</p></div>`}
        ${o.upiId ? `<p class="small" style="margin-top:12px">UPI ID: <b class="mono" style="color:var(--ink)">${esc(o.upiId)}</b> · ${esc(o.payeeName)}</p>` : ''}
        ${o.upiLink ? `<a class="btn outline sm" style="margin-top:10px" href="${esc(o.upiLink)}">Open in UPI app (mobile)</a>` : ''}
        <div class="amount" style="margin-top:14px">₹${o.amount}</div>
      </div>
      <p style="margin-top:18px;font-size:14.5px">After completing the payment, take a screenshot of your successful payment and send it to us on WhatsApp.</p>
      <a class="btn wa-btn" id="waBtn" href="${esc(o.whatsappHref)}" target="_blank" rel="noopener" style="margin-top:14px">${ICON.whatsapp} Send Payment Screenshot on WhatsApp</a>
      <p class="note" style="margin-top:12px">Never share your UPI PIN, OTP, card number, CVV or bank password with anyone — we will never ask for them.</p>`;
  } else if (o.paymentStatus === 'verified') {
    main = o.auditId
      ? `<span class="status-chip verified">${ICON.check} Payment Verified</span>
         <h2 style="font:700 26px var(--display);margin:14px 0 6px">${o.auditStatus === 'complete' ? 'Your audit is ready' : o.auditStatus === 'failed' ? 'We hit a problem auditing your site' : 'Your audit is running'}</h2>
         <p>${o.auditStatus === 'complete' ? 'Open your dashboard to see your score, every issue and how to fix it.' : o.auditStatus === 'failed' ? 'Our team has been notified and will re-run it or contact you.' : `We're crawling up to ${o.pages} pages of ${esc(o.website)}. This page updates automatically.`}</p>
         ${o.auditStatus !== 'failed' ? `<a class="btn accent lg" style="margin-top:18px;width:100%" href="/audit/${encodeURIComponent(o.auditId)}">${o.auditStatus === 'complete' ? 'Open My SEO Audit Dashboard' : 'Payment Verified — Start My Audit'}</a>` : ''}`
      : `<span class="status-chip verified">${ICON.check} Payment Verified</span><h2 style="font:700 24px var(--display);margin:14px 0 6px">Starting your audit…</h2><p>This page updates automatically.</p>`;
  } else if (o.paymentStatus === 'rejected') {
    main = `<span class="status-chip rejected">Payment Rejected</span>
      <h2 style="font:700 24px var(--display);margin:14px 0 6px">We couldn't verify this payment</h2>
      <p>If you have paid, please send the payment confirmation again on WhatsApp and we'll recheck it.</p>
      <a class="btn wa-btn" href="${esc(o.whatsappHref)}" target="_blank" rel="noopener" style="margin-top:16px">${ICON.whatsapp} Contact us on WhatsApp</a>`;
  } else {
    main = `<div class="pay-steps" aria-hidden="true"><span class="on"></span><span class="on"></span><span class="on"></span></div>
      <span class="status-chip verifying">Payment Status: Under Verification</span>
      <h2 style="font:700 26px var(--display);margin:14px 0 6px;letter-spacing:-0.02em">Payment Submitted for Verification</h2>
      <p style="font-size:15px">Thank you! Your payment confirmation has been sent for verification. Once your payment is verified, we'll process your ${esc(o.planName)} and notify you through WhatsApp/email.</p>
      <p class="small" style="margin-top:12px">Keep this page bookmarked — it updates by itself when your payment is verified.</p>
      <a class="btn outline sm" href="${esc(o.whatsappHref)}" target="_blank" rel="noopener" style="margin-top:16px">${ICON.whatsapp} Didn't send the screenshot? Open WhatsApp again</a>`;
  }

  view.innerHTML = `
    <div class="pay">
      <section class="form-card">${main}</section>
      <aside class="stack">
        <div class="card card-pad">
          <div class="row"><span class="eyebrow">Order summary</span><span class="spacer"></span>${chip ? `<span class="status-chip ${chip[0]}" style="padding:5px 10px;font-size:11.5px">${chip[1]}</span>` : ''}</div>
          <h1 style="font:700 22px var(--display);margin-top:8px">${esc(o.planName)}</h1>
          <dl class="kv" style="margin-top:14px;grid-template-columns:110px 1fr">
            <dt>Amount</dt><dd><b style="color:var(--ink)">₹${o.amount}</b> (one-time)</dd>
            <dt>Pages</dt><dd>Up to ${o.pages}</dd>
            <dt>Website</dt><dd class="break">${esc(o.website)}</dd>
            <dt>Business</dt><dd>${esc(o.business)}</dd>
            <dt>Name</dt><dd>${esc(o.name)}</dd>
            <dt>Email</dt><dd class="break">${esc(o.email)}</dd>
            <dt>Order ref</dt><dd class="mono">${esc(o.ref)}</dd>
            <dt>Created</dt><dd>${fmtDate(o.createdAt, true)}</dd>
          </dl>
        </div>
        <div class="card card-pad">
          <ol class="timeline">${STEPS.map(([k, t, d], i) => `<li class="${i < st ? 'done' : i === st ? 'now' : ''}"><span class="d">${i < st ? ICON.check : ''}</span><div><b>${t}</b><div class="small">${d}</div></div></li>`).join('')}</ol>
        </div>
      </aside>
    </div>`;

  const wa = document.getElementById('waBtn');
  if (wa) wa.addEventListener('click', async () => {
    // Opening WhatsApp records that a screenshot is on its way; it does NOT mark the order paid.
    try { render(await api(`/public/orders/${encodeURIComponent(token)}/submitted`, { method: 'POST' })); } catch {}
  });

  clearInterval(poll);
  const needsPoll = o.paymentStatus !== 'pending' && o.paymentStatus !== 'rejected' && o.auditStatus !== 'complete' && o.auditStatus !== 'failed';
  if (needsPoll) poll = setInterval(refresh, 15000);
}

async function refresh() {
  try { render(await api(`/public/orders/${encodeURIComponent(token)}`)); } catch (e) {
    clearInterval(poll);
    view.innerHTML = `<div class="card empty"><h3>Order not found</h3><p>${esc(e.message)}</p><a class="btn sm accent" href="/seo-audit" style="margin-top:14px">Back to SEO Audit</a></div>`;
  }
}
refresh();
