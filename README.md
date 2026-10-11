# Hermes Model Stats

A Hermes desktop dashboard for cross-provider AI usage. It summarizes requests,
input/output and cached tokens, reasoning tokens, estimated and actual cost,
models, providers, tools, recent requests, and time-series activity over 1 hour,
24 hours, 7 days, 30 days, or all time.

## Data and privacy

The backend reads the active Hermes `state.db` in SQLite read-only mode. Data
stays on the Hermes host; this plugin makes no third-party network requests.
The published desktop file intentionally contains no usage snapshot or session
records. The database location follows `HERMES_HOME`, falling back to
`~/.hermes/state.db`.

## Install from this repository

```sh
git clone https://github.com/gnanasreekar/Hermes-model-stats.git \
  "${HERMES_HOME:-$HOME/.hermes}/plugins/hermes-model-stats"
hermes plugins enable --no-allow-tool-override hermes-model-stats
```

Then reload desktop plugins (Command Palette → **Reload desktop plugins**).
The plugin requires a Hermes build with the desktop plugin SDK and plugin API
support. From a Hermes checkout, validate with:

```sh
hermes plugins validate .
```

## Package layout

- `plugin.yaml` — Hermes plugin manifest
- `dashboard/manifest.json` — dashboard API registration
- `dashboard/plugin_api.py` — read-only local telemetry API
- `desktop/plugin.js` — Hermes desktop dashboard and status-bar entry

## License

The plugin manifest declares MIT.
