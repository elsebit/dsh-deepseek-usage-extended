# DeepSeek Usage Extended

A personal-use fork of [dougen/dsh-deepseek-usage](https://github.com/dougen/dsh-deepseek-usage) with additional IKunCode account balance support and a provider name above the account reading. Upstream provider readers, model price snapshots and subscription usage features are preserved. This is not a generic adapter for every API gateway.

## Install

Download the prebuilt `dsh-deepseek-usage-extended.tgz` from [Releases](https://github.com/elsebit/dsh-deepseek-usage-extended/releases), and install it through the Desktop plugin manager. Standalone Web profiles can use:

```sh
dsh plugin --profile web add https://github.com/elsebit/dsh-deepseek-usage-extended/releases/latest/download/dsh-deepseek-usage-extended.tgz
```

The package is `@elsebit/dsh-deepseek-usage-extended`. It is distributed through GitHub Releases, not currently npm. Do not install the upstream npm package expecting the extension. Desktop users should use their application's active profile. Follow the host's refresh/restart instructions and do not force incompatible versions.

The extension has separate HTTP routes, configuration IDs and sidebar slots. It does not overwrite upstream settings. Disable the original usage plugin if you want only one usage card. Existing provider mappings are not migrated automatically. The inherited OAuth credential references are shared: changing or clearing a subscription token in either plugin affects the other.

## IKunCode configuration

Open the extension's usage settings and map your custom provider route to `ikuncode`. Leave credential references empty to use the route-derived reference (for example, `relay` uses `RELAY_API_KEY`), or specify your existing IKunCode credential reference. `IKUNCODE_API_KEY` is the fallback. References are names, not secret values. Never map another vendor's credential or account-login grant to IKunCode.

The reader sends GET requests only to `https://api.ikuncode.cc/api/usage/token/`, with Bearer authentication and redirects disabled. It uses `data.user_quota.total_available`, never the token's remaining limit. Missing account quota displays a query error, not a fabricated zero. The site-specific conversion is 500000 quota per CNY, verified on 2026-11-11; it must be reviewed if the site's billing configuration changes. Official model prices and peak/off-peak rules are not applied to IKunCode.

## Relay price display

IKunCode uses the existing three-value price row: uncached input, cached input, and output, per million tokens in CNY. No separate quote table is added. Prices combine the current public model rules with the most recent consumption group for the exact model, observed within 24 hours. Hovering the price row identifies the last-used group and warns that account discounts or routing changes may differ. A historical group is not a live token configuration lookup or a guarantee of the next request's rate.

The host reads `/api/pricing`, `/api/status`, and `/api/log/token` from the fixed IKunCode origin, with redirects disabled. Only the log request carries the mapped API key. Raw logs are neither sent to the browser nor stored on disk. Normalized results are cached for one minute. Missing group evidence, unsupported currency, ambiguous models, or unrecognized context/time-dependent billing expressions hide the price row without breaking balance queries. Only validated linear expressions and standard ratio billing are supported.

Relay pricing lives in `lib/relay-pricing.js`, separate from official price snapshots and the UI. New relays require explicit endpoint allowlists and provider-specific normalization; no arbitrary server expressions are executed.

### Price interpretation

The three values are uncached input, cache-read input, and output prices. Cache creation is not a fourth displayed value. Each value is per million tokens, not a total request charge. Rates are based on the public price configuration and the last observed group, not a reconciliation of account-specific discounts.

A newly selected model with no recent consumption record can show a balance without a price row. The same applies to conditional billing expressions and disabled token-log access. Changing or rotating the API key invalidates the relevant price-cache identity. There is no inference request to probe the rate.

### Adapter boundaries

Balance and price readers have separate responsibilities. `lib/accounts.js` normalizes balances; `lib/relay-pricing.js` resolves relay prices; `lib/index.js` supplies credentials and combines results; `lib/client.js` renders the existing card. The official static price tables remain in `lib/pricing.js`. Price lookup failure must not change a successful balance into an account error.

## Migration from the original or standalone plugin

1. Install this extension using the active Desktop profile's plugin manager. Keep your existing model provider and credentials unchanged.
2. Disable `@dougen/dsh-deepseek-usage` to avoid duplicate usage cards. Remove `@elsebit/dsh-ikuncode-usage` if it was installed; its fixed standalone card is not needed here. Removing the plugin does not require deleting model credentials.
3. Open this extension's settings. Its configuration entry ID is `deepseek-usage-extended`; the inherited settings navigation may still use the label "DeepSeek Usage". If both versions are enabled, use the extension's plugin configuration to distinguish them.
4. Add a provider mapping for the exact custom model route ID. For a route named `ikun`, use capability `ikuncode` and optionally the reference `IKUN_API_KEY`.
5. Refresh the page, select a model on that route, and click the usage card. The card follows model selection; it does not display all provider balances simultaneously.

Equivalent configuration within the active profile patch:

```yaml
- id: deepseek-usage-extended
  name: '@elsebit/dsh-deepseek-usage-extended'
  config:
    providerAliases:
      - provider: ikun
        capability: ikuncode
        refs: [IKUN_API_KEY]
```

`IKUN_API_KEY` is a reference name, not a secret. Substitute your own route and reference names. Do not paste a key into this YAML. DeepSeek account login continues to use the host's official account grant; do not map that route to IKunCode.

### Verification and troubleshooting

- Official model selected: the card uses the corresponding upstream account reader.
- IKunCode route selected: it uses the account balance endpoint, without official model pricing.
- Missing-key error: verify the credential reference against your model provider's settings.
- Missing account quota: check the site's quota-query permission; the extension will not substitute token limits.
- A stale card after installation: refresh the existing page, then restart the host only if the plugin manager requests it.
- No card: verify this bundle is enabled in the Desktop's active profile, not a separate Web profile.

To roll back, disable this extension and re-enable the original plugin. Existing credentials are reused; do not clear them. Plugin removal does not automatically copy provider mappings between distributions. This extension's routes are namespaced under `/api/deepseek-usage-extended`.

## Other providers

The card follows the selected model and preserves upstream balance readers, subscription windows, pricing and refresh behavior. Configure API keys using DSH's Models page. Claude Code and Codex subscription usage require the appropriate OAuth credentials, not a relay API key. See the [upstream documentation](https://github.com/dougen/dsh-deepseek-usage#readme) for inherited provider behavior. The included localized upstream documentation is retained for reference; use the installation instructions above for this distribution.

## Development and releases

Node.js 24 or later is required for the tests. Run `npm test`. Tests use synthetic inputs and do not require real API keys. A version tag matching package.json triggers GitHub Actions to test, pack and publish a GitHub Release with a SHA256 checksum. This does not guarantee market approval or automatic client upgrades.

## Attribution and license

Based on dsh-deepseek-usage by dougen and its contributors. Upstream history, notices and localized resources are retained. The upstream package declares the MIT license; see [NOTICE.md](NOTICE.md) for the provenance and licensing caveat. The extension does not claim authorship of upstream work. Not affiliated with DeepSeek or IKunCode.
