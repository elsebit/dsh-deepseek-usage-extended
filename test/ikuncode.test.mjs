import test from 'node:test';
import assert from 'node:assert/strict';
import { accountCapabilityOf, aliasableProviderIds, parseIkunCodeBalance, makeAccountReader } from '../lib/accounts.js';
import { normalizeAliases, createProviderResolver } from '../lib/providers.js';
import { unitAt } from '../lib/pricing.js';

const payload = (value) => ({ code: true, data: { unlimited_quota: true, total_available: 999999999, user_quota: { total_available: value } } });

test('IKunCode reads account funds, preserving zero and debt', () => {
  for (const [raw, total] of [[1250000, 2.5], ['500000', 1], [0, 0], [-250000, -0.5]]) {
    assert.deepEqual(parseIkunCodeBalance(payload(raw)), { ok: true, balance: { isAvailable: true, total, currency: 'CNY' }, usage: null });
  }
});
test('missing account quota never falls back to token limits', () => {
  for (const value of [undefined, null, '', ' ', false, true, 'bad', Infinity, {}, []]) assert.equal(parseIkunCodeBalance(payload(value)).ok, false);
  for (const body of [null, {}, { code: true, data: { total_available: 500000 } }, { ...payload(1), success: false }, { ...payload(1), code: false }]) assert.equal(parseIkunCodeBalance(body).ok, false);
});
test('custom routes map to IKunCode with their own credential reference', () => {
  assert.ok(aliasableProviderIds().includes('ikuncode'));
  const { aliases, warnings } = normalizeAliases([{ provider: 'relay', capability: 'ikuncode', refs: [] }]);
  assert.deepEqual(warnings, []);
  const result = createProviderResolver(aliases).resolve('relay');
  assert.equal(result.capabilityId, 'ikuncode');
  assert.deepEqual(result.refs, ['RELAY_API_KEY', 'IKUNCODE_API_KEY']);
});
test('IKunCode does not inherit official prices or peak windows', () => {
  const unit = unitAt('deepseek-chat', Date.now(), 'ikuncode');
  assert.equal(unit.known, false); assert.equal(unit.window, null);
});
test('reader uses fixed HTTPS endpoint, Bearer auth and disabled redirects', async () => {
  let calls = 0;
  const reader = makeAccountReader({ fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.ikuncode.cc/api/usage/token/');
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-key'); assert.equal(init.body, undefined);
    return Response.json(payload(2500000));
  } });
  assert.equal((await reader.read(accountCapabilityOf('ikuncode'), 'synthetic-key')).balance.total, 5);
  assert.equal(calls, 1);
});
test('failed requests never return upstream secrets', async () => {
  for (const fetchImpl of [async () => new Response('{}', { status: 401 }), async () => new Response('not json'), async () => { throw new Error('synthetic-secret'); }, async () => { throw new DOMException('synthetic-secret', 'TimeoutError'); }]) {
    const result = await makeAccountReader({ fetchImpl }).read(accountCapabilityOf('ikuncode'), 'synthetic-secret');
    assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  }
});
