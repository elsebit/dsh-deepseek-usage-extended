# DeepSeek Usage Extended

A fork of [dougen/dsh-deepseek-usage](https://github.com/dougen/dsh-deepseek-usage) with additional IKunCode account balance support. Upstream provider readers, model price snapshots and subscription usage features are preserved. This is not a generic adapter for every API gateway.

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

## Other providers

The card follows the selected model and preserves upstream balance readers, subscription windows, pricing and refresh behavior. Configure API keys using DSH's Models page. Claude Code and Codex subscription usage require the appropriate OAuth credentials, not a relay API key. See the [upstream documentation](https://github.com/dougen/dsh-deepseek-usage#readme) for inherited provider behavior. The included localized upstream documentation is retained for reference; use the installation instructions above for this distribution.

## Development and releases

Node.js 24 or later is required for the tests. Run `npm test`. Tests use synthetic inputs and do not require real API keys. A version tag matching package.json triggers GitHub Actions to test, pack and publish a GitHub Release with a SHA256 checksum. This does not guarantee market approval or automatic client upgrades.

## Attribution and license

Based on dsh-deepseek-usage by dougen and its contributors. Upstream history, notices and localized resources are retained. The upstream package declares the MIT license; see [NOTICE.md](NOTICE.md) for the provenance and licensing caveat. The extension does not claim authorship of upstream work. Not affiliated with DeepSeek or IKunCode.
