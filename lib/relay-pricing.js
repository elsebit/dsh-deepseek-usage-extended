// Relay adapters return only normalized unit prices and provenance, never raw logs.
// Adding a relay requires explicit trusted endpoints and a separate pricing resolver.
const ADAPTERS = {
  ikuncode: { origin: 'https://api.ikuncode.cc', maxAgeMs: 24 * 3600000 },
};
const cache = new Map();
const pending = new Map();
const number = (v) => (typeof v === 'number' || typeof v === 'string' && v.trim()) && Number.isFinite(Number(v)) ? Number(v) : null;
export function supportsRelayPricing(id) { return Object.hasOwn(ADAPTERS, id); }

// Parse a deliberately small linear grammar. Never execute a server expression.
export function linearRates(expression) {
  if (typeof expression !== 'string' || expression.length > 4096) return null;
  const match = expression.trim().match(/^tier\("[a-zA-Z0-9_-]+",\s*([^()]+)\)$/);
  if (!match) return null;
  const result = {};
  for (const term of match[1].split('+')) {
    const m = term.trim().match(/^(p|c|cr|cc|cc1h|cc12h)\s*\*\s*(\d+(?:\.\d+)?)$/);
    if (!m || Object.hasOwn(result, m[1])) return null;
    result[m[1]] = Number(m[2]);
  }
  return ['p', 'c', 'cr'].every((k) => Number.isFinite(result[k])) ? result : null;
}

export function contextRates(expression, length) {
  if (typeof expression !== 'string' || expression.length > 4096 || !Number.isSafeInteger(length) || length <= 0) return null;
  const match = expression.trim().match(/^len\s*<=\s*(\d+)\s*\?\s*(tier\("[a-zA-Z0-9_-]+",\s*[^()]+\))\s*:\s*(tier\("[a-zA-Z0-9_-]+",\s*[^()]+\))$/);
  if (!match) return null;
  const threshold = Number(match[1]);
  const short = linearRates(match[2]), long = linearRates(match[3]);
  if (!Number.isSafeInteger(threshold) || threshold <= 0 || !short || !long) return null;
  return { rates: length <= threshold ? short : long, threshold, length, tier: length <= threshold ? 'short' : 'long' };
}

export function resolveIkunPricing({ model, logs, pricing, status, now = Date.now() }) {
  const spec = ADAPTERS.ikuncode;
  if (!Array.isArray(logs) || pricing?.success !== true || status?.success !== true) return null;
  const unit = number(status.data?.quota_per_unit);
  if (unit === null || unit <= 0 || status.data?.quota_display_type !== 'CNY' || number(status.data?.usd_exchange_rate) !== 1) return null;
  const log = logs.filter((l) => l?.type === 2 && l.model_name === model && typeof l.group === 'string' && l.group && number(l.created_at) !== null)
    .sort((a, b) => Number(b.created_at) - Number(a.created_at))[0];
  if (!log || now - Number(log.created_at) * 1000 > spec.maxAgeMs || Number(log.created_at) * 1000 > now + 60000) return null;
  const entries = Array.isArray(pricing.data) ? pricing.data.filter((m) => m.model_name === model) : [];
  if (entries.length !== 1) return null;
  const row = entries[0];
  if (row.quota_type !== 0 || !row.enable_groups?.includes(log.group)) return null;
  const ratio = number(pricing.group_ratio?.[log.group]);
  if (ratio === null || ratio < 0) return null;
  let rates, context = null;
  if (row.billing_mode === 'tiered_expr') {
    rates = linearRates(row.billing_expr);
    if (!rates && /^gpt-/.test(model)) {
      // GPT relay logs report total prompt tokens, including cache reads.
      // Other protocol families need their own normalized length evidence.
      context = contextRates(row.billing_expr, number(log.prompt_tokens));
      rates = context?.rates;
    }
    if (!rates) return null;
  } else {
    if (row.billing_mode && row.billing_mode !== 'ratio') return null;
    const base = number(row.model_ratio), completion = number(row.completion_ratio), read = number(row.cache_ratio);
    if ([base, completion, read].some((n) => n === null || n < 0)) return null;
    rates = { p: base * 1000000 / unit, c: base * completion * 1000000 / unit, cr: base * read * 1000000 / unit };
  }
  const input = rates.p * ratio, output = rates.c * ratio, cacheRead = rates.cr * ratio;
  if (![input, output, cacheRead].every((n) => Number.isFinite(n) && n >= 0)) return null;
  // A last-used group is not proof of the next request's group or an account-specific discount.
  return { input, output, cacheRead, cacheWrite: null, currency: 'CNY', known: true, model,
    window: null, via: 'relay', requested: model,
    note: `Public rates for last-used group ${log.group}; account discounts and routing changes may differ.` + (context ? ` ${context.tier} tier from last request: ${context.length} input tokens (threshold ${context.threshold}). Next-request context may differ.` : ''),
    source: { group: log.group, observedAt: Number(log.created_at) * 1000, basis: 'public-rates-last-used-group' } };
}

async function jsonRequest(url, headers, fetchImpl) {
  const res = await fetchImpl(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('request');
  const reader = res.body?.getReader();
  if (!reader) throw new Error('payload');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 2 * 1024 * 1024) throw new Error('size');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function readRelayPricing(id, model, key, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (!supportsRelayPricing(id) || typeof model !== 'string' || typeof key !== 'string' || !/^[\x21-\x7e]+$/.test(key)) return null;
  const bucket = `${id}\0${model}\0${key}`;
  for (const [k, v] of cache) if (now - v.at >= 60000) cache.delete(k);
  if (cache.has(bucket)) return cache.get(bucket).result;
  if (pending.has(bucket)) return pending.get(bucket);
  const request = (async () => {
    try {
      const origin = ADAPTERS[id].origin;
      const [pricing, status, logs] = await Promise.all([
        jsonRequest(origin + '/api/pricing', { Accept: 'application/json' }, fetchImpl),
        jsonRequest(origin + '/api/status', { Accept: 'application/json' }, fetchImpl),
        jsonRequest(origin + '/api/log/token', { Accept: 'application/json', Authorization: `Bearer ${key}` }, fetchImpl),
      ]);
      const result = logs?.success === true ? resolveIkunPricing({ model, logs: logs.data, pricing, status, now }) : null;
      // Cache only normalized data. Do not retain account logs or raw upstream payloads.
      if (cache.size >= 32) cache.delete(cache.keys().next().value);
      cache.set(bucket, { at: now, result });
      return result;
    } catch { return null; }
  })();
  pending.set(bucket, request);
  try { return await request; } finally { pending.delete(bucket); }
}
