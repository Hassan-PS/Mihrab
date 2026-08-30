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
