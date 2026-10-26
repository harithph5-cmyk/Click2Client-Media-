const name = { '/privacy-policy': 'privacy', '/terms': 'terms', '/refund-policy': 'refund' }[location.pathname];
api('/api/policy/' + name).then((p) => {
  document.title = `${p.title} | Master Meta Ads Workshop`;
  $('#t').textContent = p.title;
  $('#b').innerHTML = p.text.split(/\n{2,}/).map((x) => `<p style="margin-bottom:14px;white-space:pre-line">${esc(x)}</p>`).join('');
}).catch(() => { $('#t').textContent = 'Not found'; });
