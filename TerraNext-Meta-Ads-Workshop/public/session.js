// One script for /payment/:t, /payment-status/:t and /registration-confirmed/:t. All data and every decision come from the server.
const [, route, token] = location.pathname.split('/');
const app = $('#app');
const steps = (n) => `<div class="steps">${['Register', 'Pay', 'Submit transaction ID', 'Confirmation'].map((s, i) => `<span class="${i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''}">${i + 1} ${s}</span>`).join('')}</div>`;
const summary = (s, extra = '') => `<dl class="summary">
  <div><dt>Registration ID</dt><dd>${esc(s.registrationId)}</dd></div><div><dt>Participant</dt><dd>${esc(s.name)}</dd></div>
  <div><dt>Workshop</dt><dd>${esc(s.workshop.title)}</dd></div><div><dt>Date</dt><dd>${esc(s.workshop.weekday)}, ${esc(s.workshop.date)} · Live Online</dd></div>
  <div><dt>Amount payable</dt><dd>${esc(s.amount)}</dd></div>${extra}</dl>`;
const label = { PENDING_PAYMENT: 'PENDING', VERIFICATION_PENDING: 'VERIFICATION PENDING', PAID: 'VERIFIED', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED', CANCELLED: 'CANCELLED' };
const statusRow = (s) => `<div><dt>Payment status</dt><dd><span class="status ${esc(s.status)}">${label[s.status] || esc(s.status)}</span></dd></div>`;
const go = (p) => { location.replace(`/${p}/${token}`); };

function paymentPage(s) {
  track('payment_instructions_view', {}, true);
  app.innerHTML = `${steps(2)}<h1>You're One Step Away From Joining Master Meta Ads!</h1>
    <p class="lead">Your registration details have been saved. Complete your ${esc(s.amount)} payment to continue.</p>
    ${summary(s, statusRow(s))}
    ${s.qrAvailable ? `
    <div class="qrbox"><img src="/api/session/${token}/qr" alt="Official UPI payment QR code" width="400"><p class="fine">Pay exactly ${esc(s.amount)} · Scan with any UPI app</p></div>
    <div class="alert warn" style="margin-bottom:16px">Before paying, verify the recipient name shown in your UPI application${s.recipientName ? ` (expected: <b>${esc(s.recipientName)}</b>)` : ''}. If the recipient details do not match the organizer's verified payment details, do not proceed.</div>
    <h3>How to pay</h3>
    <ol><li>Open your preferred UPI payment app.</li><li>Scan the official QR code.</li><li>Confirm that the payment recipient is correct.</li><li>Pay exactly ${esc(s.amount)}.</li><li>Complete the transaction in your payment app.</li><li>Copy the UPI transaction reference or UTR from your successful transaction.</li><li>Submit the transaction reference through WhatsApp using the button below.</li></ol>
    <p class="fine">Never share your UPI PIN or OTP with anyone. We will never ask for it.</p>
    <a class="btn btn-yellow" style="margin-top:14px;width:100%" href="/payment-status/${token}">I HAVE PAID — SUBMIT TRANSACTION ID</a>`
    : `<div class="alert bad">Payment is temporarily unavailable. Please contact the workshop team.</div>`}
    ${helpLine(s)}`;
}
const helpLine = (s) => `<p class="fine" style="margin-top:18px">Need help? WhatsApp <a href="https://wa.me/91${esc(s.workshop.contact)}">${esc(s.workshop.contact)}</a>. Bookmark this page to return to your registration.</p>`;

function statusPage(s) {
  const sub = s.submission;
  if (s.status === 'PENDING_PAYMENT') {
    if (!s.qrAvailable) return app.innerHTML = `${steps(3)}<h1>Payment unavailable</h1><div class="alert bad" style="margin-top:14px">Payment is temporarily unavailable. Please contact the workshop team.</div>${helpLine(s)}`;
    app.innerHTML = `${steps(3)}<h1>Submit Your Payment Details</h1>
      <p class="lead">Enter the UPI transaction reference (UTR) from your payment app.</p>
      ${sub?.status === 'CORRECTION_REQUESTED' ? `<div class="alert warn" style="margin-bottom:16px">The workshop team asked for corrected details: ${esc(sub.reason)}</div>` : ''}
      ${summary(s)}
      <form id="pf" novalidate>
        <div class="alert bad" id="pe" role="alert" hidden></div>
        <div class="fld"><label for="ref">UPI transaction reference / UTR</label><input id="ref" name="transactionReference" autocomplete="off" maxlength="35" required><div class="err" data-for="transactionReference"></div></div>
        <div class="fld"><label for="pd">Payment date</label><input id="pd" name="paymentDate" type="date" required><div class="err" data-for="paymentDate"></div></div>
        <div class="fld"><label for="shot">Payment screenshot <span class="opt">(optional · PNG, JPG or WEBP · max 3 MB)</span></label><input id="shot" name="screenshot" type="file" accept="image/png,image/jpeg,image/webp"><div class="err" data-for="screenshot"></div></div>
        <button class="btn btn-yellow" id="sb" type="submit">SUBMIT FOR VERIFICATION</button>
        <a class="btn btn-line" href="/payment/${token}">Back to QR code</a>
      </form>${helpLine(s)}`;
    const pd = $('#pd'); pd.max = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); pd.value = pd.max;
    $('#pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, fd = new FormData(f), file = fd.get('screenshot');
      const ref = String(fd.get('transactionReference')).trim();
      $$('.err', f).forEach((x) => (x.textContent = ''));
      if (!/^[A-Za-z0-9][A-Za-z0-9\-_/]{7,34}$/.test(ref)) return ($('[data-for=transactionReference]').textContent = 'Enter the UPI transaction reference / UTR (8–35 letters or digits)');
      if (file && file.size > 3 * 1024 * 1024) return ($('[data-for=screenshot]').textContent = 'File is too large (max 3 MB)');
      if (!file?.size) fd.delete('screenshot');
      $('#sb').disabled = true;
      try { await api(`/api/session/${token}/payment`, { method: 'POST', body: fd }); track('payment_reference_submitted'); go('payment-status'); }
      catch (err) {
        $('#sb').disabled = false;
        if (err.status === 409) return go('payment-status');
        if (err.fields) Object.entries(err.fields).forEach(([k, m]) => { const el = $(`[data-for="${k}"]`); if (el) el.textContent = m; });
        $('#pe').textContent = err.message; $('#pe').hidden = false;
      }
    });
  } else if (s.status === 'VERIFICATION_PENDING') {
    app.innerHTML = `${steps(3)}<h1>Send Your Details on WhatsApp</h1>
      <div class="alert ok" style="margin:14px 0">Your payment details have been submitted for verification. Your registration will be confirmed after the workshop team verifies the payment.</div>
      ${summary(s, statusRow(s) + `<div><dt>Transaction reference</dt><dd>${esc(sub.reference)}</dd></div><div><dt>Payment date</dt><dd>${esc(sub.paymentDate)}</dd></div>`)}
      <p>Tap the button, then <b>press Send in WhatsApp</b> so the team can match your payment faster. Opening WhatsApp does not confirm your seat. Only the team's verification does.</p>
      <a class="btn btn-green" id="wa" style="width:100%;margin:16px 0" href="${esc(s.whatsappUrl)}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i> SEND ON WHATSAPP</a>
      <details><summary>WhatsApp didn't open? Copy the message</summary><div class="stack"><div class="wa-msg" id="wm">${esc(s.whatsappText)}</div><button class="btn btn-line btn-sm" id="cp" type="button">Copy message</button></div></details>
      <button class="btn btn-line" style="width:100%;margin-top:16px" id="rf" type="button">Check payment status</button>${helpLine(s)}`;
    window.lucide?.createIcons();
    $('#wa').addEventListener('click', () => track('whatsapp_click', { location: 'payment_flow' }));
    $('#cp').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(s.whatsappText); e.target.textContent = 'Copied ✓'; } catch { const r = document.createRange(); r.selectNodeContents($('#wm')); getSelection().removeAllRanges(); getSelection().addRange(r); } });
    $('#rf').addEventListener('click', () => location.reload());
  } else if (s.status === 'REJECTED') {
    app.innerHTML = `<h1>Payment Not Verified</h1><div class="alert bad" style="margin:14px 0">${esc(sub?.reason || 'The workshop team could not verify this payment.')}</div>${summary(s, statusRow(s))}<p>Please contact the workshop team. Do not pay again until you have checked with them.</p>${helpLine(s)}`;
  } else {
    app.innerHTML = `<h1>Registration ${esc(label[s.status] || s.status)}</h1>${summary(s, statusRow(s))}${helpLine(s)}`;
  }
}

function confirmedPage(s) {
  track('payment_verified', {}, true); // only reached when the server reports PAID
  const when = new Date(s.confirmedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  app.innerHTML = `${steps(5)}<p class="big">YOUR SEAT IS CONFIRMED!</p>
    <p class="lead">Congratulations! Your payment for the Master Meta Ads Workshop has been verified.</p>
    ${summary(s, `${statusRow(s)}<div><dt>Confirmed on</dt><dd>${esc(when)} IST</dd></div>`)}
    <p>Workshop joining instructions will be shared with you by the organizer on your registered WhatsApp number or email.</p>${helpLine(s)}`;
}

(async () => {
  try {
    const s = await api(`/api/session/${token}`);
    if (route === 'registration-confirmed') return s.status === 'PAID' ? confirmedPage(s) : go(s.status === 'PENDING_PAYMENT' ? 'payment' : 'payment-status');
    if (s.status === 'PAID') return go('registration-confirmed');
    if (route === 'payment') return s.status === 'PENDING_PAYMENT' ? paymentPage(s) : go('payment-status');
    statusPage(s);
  } catch (e) {
    app.innerHTML = `<h1>Link not valid</h1><div class="alert bad" style="margin:14px 0">${esc(e.message)}</div><a class="btn btn-yellow" href="/register">Register again</a>`;
  }
})();
