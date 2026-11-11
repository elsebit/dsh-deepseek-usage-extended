import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIkunPricing, linearRates, readRelayPricing } from '../lib/relay-pricing.js';
const now = 1800000000000;
const fixture = () => ({ model: 'sample', now,
  logs: [{ type: 2, model_name: 'sample', group: 'test', created_at: now / 1000 }],
  status: { success: true, data: { quota_per_unit: 500000, quota_display_type: 'CNY', usd_exchange_rate: 1 } },
  pricing: { success: true, group_ratio: { test: 0.25 }, data: [{ model_name: 'sample', quota_type: 0, enable_groups: ['test'], billing_mode: 'tiered_expr', billing_expr: 'tier("base", p * 2 + cr * 0.1 + cc * 2.5 + c * 10)' }] },
});
test('expression adapter derives only three displayed prices with group provenance', () => {
  const result = resolveIkunPricing(fixture());
  assert.equal(result.input, 0.5); assert.equal(result.cacheRead, 0.025); assert.equal(result.output, 2.5);
  assert.equal(result.source.group, 'test'); assert.match(result.note, /last-used group/);
});
test('ratio billing uses quota units rather than a hard-coded dollar conversion', () => {
  const f = fixture(); f.status.data.quota_per_unit = 1000000;
  Object.assign(f.pricing.data[0], { billing_mode: undefined, model_ratio: 2, completion_ratio: 5, cache_ratio: 0.1 });
  const result = resolveIkunPricing(f);
  assert.equal(result.input, 0.5); assert.equal(result.output, 2.5); assert.equal(result.cacheRead, 0.05);
});
test('unknown, stale, future, unrelated, unsupported and ambiguous data fails closed', () => {
  const mutations = [
    (f) => { f.logs = []; }, (f) => { f.logs[0].model_name = 'other'; },
    (f) => { f.logs[0].created_at -= 86401; }, (f) => { f.logs[0].created_at += 120; },
    (f) => { f.pricing.group_ratio = {}; }, (f) => { f.pricing.data.push(f.pricing.data[0]); },
    (f) => { f.status.data.quota_display_type = 'USD'; },
    (f) => { f.pricing.data[0].billing_expr = 'len > 1 ? tier("base", p * 2) : 0'; },
    (f) => { f.pricing.data[0].quota_type = 1; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.equal(resolveIkunPricing(f), null); }
  for (const expr of ['evil()', 'tier("base", p * 1 + p * 2 + c * 3 + cr * 0)', 'tier("base", p * 1 + c * 3)']) assert.equal(linearRates(expr), null);
});
test('newest matching successful consume record determines historical group', () => {
  const f = fixture();
  f.logs.unshift({ type: 5, model_name: 'sample', group: 'invalid', created_at: now / 1000 + 1 });
  f.logs.push({ type: 2, model_name: 'other', group: 'invalid', created_at: now / 1000 + 1 });
  assert.equal(resolveIkunPricing(f).source.group, 'test');
});
test('request boundaries, normalized caching and key rotation', async () => {
  let count = 0;
  const f = fixture();
  const fetchImpl = async (url, init) => {
    count++; assert.equal(init.redirect, 'error'); assert.equal(init.method, 'GET');
    assert.ok(url.startsWith('https://api.ikuncode.cc/api/'));
    if (url.endsWith('/log/token')) { assert.match(init.headers.Authorization, /^Bearer synthetic-/); return Response.json({ success: true, data: f.logs }); }
    assert.equal(init.headers.Authorization, undefined);
    return Response.json(url.endsWith('/pricing') ? f.pricing : f.status);
  };
  const a = await readRelayPricing('ikuncode', 'sample', 'synthetic-one', { fetchImpl, now });
  assert.equal(a.input, 0.5); assert.equal(count, 3);
  await readRelayPricing('ikuncode', 'sample', 'synthetic-one', { fetchImpl, now }); assert.equal(count, 3);
  await readRelayPricing('ikuncode', 'sample', 'synthetic-two', { fetchImpl, now }); assert.equal(count, 6);
  assert.equal(JSON.stringify(a).includes('synthetic'), false);
});
test('upstream failures are optional pricing failures, not balance errors', async () => {
  const result = await readRelayPricing('ikuncode', 'sample', 'synthetic-fail', { fetchImpl: async () => { throw new Error('secret'); }, now });
  assert.equal(result, null);
});
