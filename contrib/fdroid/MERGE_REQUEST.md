# GitLab merge request (fdroiddata)

Use this title and body when opening an MR against [fdroid/fdroiddata](https://gitlab.com/fdroid/fdroiddata).

## Suggested MR title

```
Add com.prayer_times (Prayer Times)
```

## Suggested description (copy below)

```markdown
### App

- **Package ID:** `com.prayer_times`
- **Name:** Prayer Times
- **License:** Apache-2.0
- **Source:** https://github.com/Hassan-PS/PrayerApp
- **Upstream F-Droid notes:** [`contrib/fdroid/`](https://github.com/Hassan-PS/PrayerApp/tree/main/contrib/fdroid)

### Build

- React Native **0.83**, **Node 20.19.0** (official linux-x64 tarball, SHA256 verified in `sudo:`).
- `subdir: android`, `init`: `cd .. && npm ci --no-audit`.
- Gradle flavor **`fdroid`** → `assembleFdroidRelease` (no Google Play Billing; see upstream `react-native.config.js` + `playImplementation` only on `play` flavor).

### Checklist (submitter)

- [ ] Forked `fdroid/fdroiddata` and added `metadata/com.prayer_times.yml` from upstream `contrib/fdroid/com.prayer_times.yml` (**delete the 2-line comment header** at the top of that file before committing).
- [ ] Target branch: `fdroid/fdroiddata` **master** (or current default).
- [ ] CI / reviewer feedback: adjust `scanignore` / `ndk` / `sudo` if the build server requires it.
```

## Branch name (suggestion)

`add-com.prayer_times`

## Files to add in your fork

| Path in fork | Source |
|--------------|--------|
| `metadata/com.prayer_times.yml` | This repo: `contrib/fdroid/com.prayer_times.yml` (strip top comment lines) |

Do **not** commit `node_modules/` or APKs to fdroiddata — only the YAML.
