# Habous dataset

Prayer times as the Moroccan Ministry of Habous and Islamic Affairs
publishes them — `habous.gov.ma/prieres/index.php?ville=N`.

Same shape as `tools/ifis-dataset`: scrape server-side on a schedule, commit
per-city JSON, and let the app read that instead of computing an
approximation.

## What the source is like

- **191 cities**, ids 1–169 then 301–322. Not contiguous.
- **One HIJRI month per page**, so the Gregorian day column rolls over
  mid-table (14…31 August, then 1…12 September).
- The Gregorian months appear only in the header, in **Moroccan** Arabic
  month names — غشت is August, شتنبر September, not أغسطس/سبتمبر.
- **Six prayers, no Imsak.** The app derives it.
- The final row's Hijri day can read `حسب نتيجة المراقبة` rather than a
  number, because the month's last day depends on the sighting.

`src/providers/habousParser.ts` handles all of that and is pinned by
`__tests__/habous.parser.test.ts` against a saved copy of the real page.

## The certificate

`habous.gov.ma` **does not send its intermediate certificate**. SSL Labs
grades it B with `chainIssues: 2`. Browsers cope — they cache intermediates
and will fetch a missing one from the AIA URI — but Node and curl do
neither, so a plain `fetch` from a GitHub runner fails with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. It does this while looking perfectly
healthy in a browser, which is a good way to lose a day.

`intermediate.pem` is that missing link, collected from the AIA URI named in
the leaf:

    subject  Sectigo Public Server Authentication CA DV R36
    issuer   Sectigo Public Server Authentication Root R46
    expires  2036-03-21

Pass it as an **extra** CA, never as a replacement, and leave
`rejectUnauthorized` on. The chain then has to reach a real Mozilla root by
real signatures; all we have supplied is the link the server omits. If this
file ever expires or the ministry changes issuer, the probe reports the new
AIA URI.

**Never** disable certificate verification here. An app that tells people
when to pray does not fetch its times over a connection it refuses to check.

## The window is one Hijri month, and that is a hard ceiling

`index.php` takes a `ville` and nothing else. It returns whatever Hijri
month it is currently showing, and there is no way to ask for another. That
was probed rather than assumed — `mois`, `month`, `m`, `mois_hijri`,
`hijri`, `shahr`, `mm`, `annee`, on the query string and through the page's
own POST form, plus `horaire_hijri.php` and `horaire_hijri_fr.php`. Every
one returns the current month; `horaire_hijri.php` returns nothing at all.

    npx tsx tools/habous-dataset/probe.ts --discover

So forward coverage is "until this month ends": about 29 days just after a
month turns, and nearly nothing just before. **The build runs daily** to
catch each turn on the day it happens, which is the only lever available.

That is fine, and deliberately so. Beyond the window the app computes, and
since the Morocco method gained the ministry's own margins that computation
sits within a minute of the published table on every prayer across a month
(`__tests__/calculationMethods.test.ts`). The dataset buys exactness for the
near term; the fallback is good, not a cliff.

**The build gate is staleness, not horizon.** A short window is structural
and would fire a warning every single month for a condition nobody can fix —
which is how alerts get muted. What is controllable is whether every city
holds TODAY. A city that does not has a real hole, and that fails the build.

## The endpoint is not reliably up

Across four probe runs the ministry returned, in order:
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, the same again, `ECONNRESET`, and then a
run whose three attempts were TLS failure / `UND_ERR_CONNECT_TIMEOUT` / TLS
failure before the verified request succeeded. So: retry, back off, and
treat a bad run as a bad run rather than as data. The IFiS builder's
origin-health gate (`requests >= 20 && failRate > 0.5` → give up without
committing) is the right shape here too.

## The probe

    gh workflow run habous-probe.yml -f city_id=1

Fetches one city, reports the certificate chain, tries the verified request
with the intermediate, and parses what comes back. Commits nothing, is not
scheduled. Run it after any change to the ministry's page or this pinned
certificate.

## Placing the cities

`solveCoords.ts` checks every coordinate against the ministry's own Dhuhr,
which fixes longitude exactly. Run it after a build that reached cities the
previous one missed:

    npx tsx tools/habous-dataset/solveCoords.ts

It corrects the longitude and keeps the geocoded latitude **only when the
two agree**. Where they do not, the geocoder found a different place and its
latitude is worth no more than its longitude was, so the city is left
unplaced — it still has a table, it simply cannot be a nearest match.

Latitude cannot be solved from these times. Measured at Casablanca against
the ministry's August table, 100 km north moves sunrise by 0.65 min and
sunset by 0.65 min the other way; near the equinox the day is nearly the
same length everywhere, so latitude is flat in the objective and below the
resolution of minute-rounded data. An earlier version fitted it anyway and
produced confident answers 100 km wrong.

**A city left unplaced stays unplaced**, because the script skips anything
already null rather than re-testing it. To bring one back, put a coordinate
in the `OVERRIDES` table and re-run — it goes through the same longitude
gate as everything else, so a bad guess is rejected rather than trusted
because a human typed it. Ten cities are placed that way today, Marrakech
among them.
