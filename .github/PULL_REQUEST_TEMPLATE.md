<!--
Thanks for contributing to Mihrab. Please read CONTRIBUTING.md and
ARCHITECTURE.md first, and keep this PR to one logical change.
Delete any section that doesn't apply.
-->

## What & why

<!-- What does this change, and why? -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Translation / localization
- [ ] Docs
- [ ] Build / release pipeline

## Screenshots

<!-- For any visual change, before/after on the affected platform(s). Delete if N/A. -->

## How I tested

<!-- Platforms and how — iPhone simulator, a physical Pixel, npx jest, etc. -->

## Checklist

- [ ] One logical change; commits have **no** `Co-Authored-By` / AI-tool attribution lines.
- [ ] References the `IMPROVEMENT_ROADMAP.md` task number if it implements one.
- [ ] No analytics, trackers or telemetry; location stays in encrypted storage.
- [ ] Any new dependency is FOSS-compatible — nothing pulling Google Play Services or proprietary code (the F-Droid build must keep working).
- [ ] New user-facing strings added to **all 13** locales (`/locale-add`); religious terms follow the canonical table.
- [ ] No raw hex, magic spacing/radius, or raw `fontSize` — tokens only (`/tokens-audit`).
- [ ] Interactive elements have `accessibilityLabel` + `accessibilityRole`; `paddingStart/End` not `Left/Right`; hit targets ≥ 44pt (`/a11y-scan`).
- [ ] Coordinates are null-checked (never `?? 0`); provider responses go through `validateTimings()`.
- [ ] Tests added or updated under `__tests__/` and `npx jest` passes.
