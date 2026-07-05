# E2E smoke tests (Maestro)

First end-to-end coverage for Mihrab (v2.7.28). [Maestro](https://maestro.mobile.dev)
drives the real app on a running emulator/simulator — no build-time
instrumentation, flows are plain YAML.

## Install

```sh
curl -Ls https://get.maestro.mobile.dev | bash   # installs to ~/.maestro/bin
```

## Run

Start the Android emulator (or iOS simulator) with a debug build of the
app installed, then:

```sh
npm run e2e            # all flows
maestro test .maestro/flows/quran_reader.yaml   # one flow
```

## Flows

- `home_smoke.yaml` — app launches, prayer table renders, month link visible.
- `quran_reader.yaml` — Quran index renders (khatmah card, verse of the day,
  tabs), surah opens in the mushaf view.
- `settings_smoke.yaml` — settings open; appearance + notifications sections
  render; Manage downloads screen opens.

Flows assert on English UI strings — run with the app language set to
English (the default on fresh installs).
