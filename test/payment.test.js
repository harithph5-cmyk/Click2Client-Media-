import test from 'node:test';
import assert from 'node:assert/strict';
import { validUtr } from '../server/app.js';
import { fitTitle, fitDesc } from '../server/site/render.js';

test('UTR must be 12 digits and not obvious junk', () => {
  assert.ok(validUtr('412345678901'));
  for (const bad of ['', '12345', '000000000000', '111122223333', '123456789012', '987654321098', '12121212121a', '4123456789012']) assert.equal(validUtr(bad), false, bad);
});

test('titles and descriptions are trimmed to search-friendly lengths', () => {
  assert.ok(fitTitle('Free Website SEO Checker — Analyze On-Page & Technical SEO | Click2Client Media').length <= 60);
  assert.equal(fitTitle('Cookie Policy | Click2Client Media'), 'Cookie Policy | Click2Client Media');
  assert.ok(fitDesc('word '.repeat(60)).length <= 160);
});
