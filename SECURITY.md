# Security

## Reporting a vulnerability

Please report security issues privately so we can address them before public disclosure. Open a **private security advisory** on GitHub for this repository, or contact the maintainers through GitHub if that is not available.

## What must not be committed

Do **not** commit or paste into issues/PRs:

- Android release keystores (e.g. `*.keystore`, `*.jks`) or `android/keystore.properties` with real passwords
- iOS distribution certificates, provisioning profiles, or App Store Connect API keys
- API keys, OAuth client secrets, or service account JSON for any backend
- Personal access tokens, SSH private keys, or `.env` files with secrets
- `local.properties` with machine-specific SDK paths (already ignored for Android when applicable)

Use `android/keystore.properties.example` as a template; keep real values only on your machine.

## Forks

If you fork this repo, update `src/config/httpIdentity.ts` so HTTP `User-Agent` strings point to **your** public source URL instead of upstream.
