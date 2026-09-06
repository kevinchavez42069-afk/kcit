// =====================================================================
//  Anthropic API pricing, per model.
//
//  Rates are dollars per token (converted from the published per-million
//  rates so cost math stays a plain multiplication, no /1e6 scattered
//  around). Cache write here assumes the default 5-minute TTL, which is
//  what chatbot/index.mjs uses (`cache_control: { type: "ephemeral" }`,
//  no `ttl` override) - if that ever changes to a 1-hour TTL, this needs
//  a matching cacheWrite update (2x base input instead of 1.25x).
//
//  Update this table when pricing changes or a new model is added.
// =====================================================================

const PER_MILLION = {
  "claude-opus-5": { input: 5.0, output: 25.0, cacheRead: 0.5, cacheWrite: 6.25 },
};

function perToken(rates) {
  return {
    input: rates.input / 1_000_000,
    output: rates.output / 1_000_000,
    cacheRead: rates.cacheRead / 1_000_000,
    cacheWrite: rates.cacheWrite / 1_000_000,
  };
}

const RATES = Object.fromEntries(
  Object.entries(PER_MILLION).map(([model, rates]) => [model, perToken(rates)])
);

/**
 * @param {{input?: number, output?: number, cacheRead?: number, cacheWrite?: number}} usage
 * @param {string} model
 * @returns {number} cost in USD
 */
export function costFor(usage, model) {
  const rates = RATES[model];
  if (!rates) throw new Error(`No pricing entry for model "${model}" - add one to pricing.mjs`);
  return (
    (usage.input ?? 0) * rates.input +
    (usage.output ?? 0) * rates.output +
    (usage.cacheRead ?? 0) * rates.cacheRead +
    (usage.cacheWrite ?? 0) * rates.cacheWrite
  );
}

export function knownModels() {
  return Object.keys(PER_MILLION);
}
