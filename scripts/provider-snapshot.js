#!/usr/bin/env node
/**
 * /provider-snapshot backing script.
 *
 * Fetches today's prayer times from each provider for fixed reference coords
 * (Stockholm: 59.3293, 18.0686) and diffs against the last snapshot.
 *
 * Usage:
 *   node scripts/provider-snapshot.js              # today
 *   node scripts/provider-snapshot.js --ramadan    # last Ramadan reference date
 *   node scripts/provider-snapshot.js --update     # update saved snapshot
 *
 * NOTE: This is a pre-task-#7 stub. After Ramadan provider work lands, this
 * script fetches and validates the imsak field too.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, '__tests__', 'fixtures', 'snapshots');

const REFERENCE = { lat: 59.3293, lng: 18.0686, label: 'Stockholm' };
const args = process.argv.slice(2);
const ramadanMode = args.includes('--ramadan');
const updateMode = args.includes('--update');

function isoDate(d) { return d.toISOString().slice(0, 10); }
const today = new Date();
const ramadanRef = new Date(today.getFullYear(), 2, 15); // approx — replace with real Hijri lookup once #7 lands
const date = ramadanMode ? ramadanRef : today;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function snapshotAladhan() {
  const ts = Math.floor(date.getTime() / 1000);
  const url = `https://api.aladhan.com/v1/timings/${ts}?latitude=${REFERENCE.lat}&longitude=${REFERENCE.lng}&method=3`;
  const { status, body } = await fetchUrl(url);
  if (status !== 200) throw new Error(`aladhan HTTP ${status}`);
  const data = JSON.parse(body);
  return data.data?.timings || null;
}

if (!fs.existsSync(FIXTURES)) {
  fs.mkdirSync(FIXTURES, { recursive: true });
}

(async () => {
  const results = {};
  try {
    results.aladhan = await snapshotAladhan();
    console.log(`✓ aladhan — ${Object.keys(results.aladhan).length} fields`);
  } catch (e) {
    console.error(`✗ aladhan — ${e.message}`);
  }

  // PrayTimes.dev, Islamiska Förbundet, local adhan to be added as the providers
  // are built up in task #7. For now this script proves the pattern.

  const snapshotPath = path.join(FIXTURES, `aladhan-${isoDate(date)}.json`);
  if (updateMode) {
    fs.writeFileSync(snapshotPath, JSON.stringify(results.aladhan, null, 2));
    console.log(`Snapshot updated: ${path.relative(ROOT, snapshotPath)}`);
    return;
  }

  if (fs.existsSync(snapshotPath)) {
    const previous = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const prevKeys = new Set(Object.keys(previous));
    const curKeys = new Set(Object.keys(results.aladhan || {}));
    const added = [...curKeys].filter(k => !prevKeys.has(k));
    const removed = [...prevKeys].filter(k => !curKeys.has(k));
    if (added.length || removed.length) {
      console.log('');
      console.log('SHAPE CHANGE detected vs last snapshot:');
      if (added.length) console.log(`  + Added fields: ${added.join(', ')}`);
      if (removed.length) console.log(`  - Removed fields: ${removed.join(', ')}`);
      console.log('');
      console.log('Invoke the provider-doctor subagent to investigate. If intentional, re-run with --update.');
      process.exit(1);
    }
    console.log('No shape changes vs last snapshot ✓');
  } else {
    console.log('No previous snapshot — run with --update to save current as baseline.');
  }

  if (ramadanMode) {
    if (!results.aladhan?.Imsak) {
      console.error('✗ Imsak missing from Ramadan response — task #7 should ensure this is parsed.');
      process.exit(1);
    }
    console.log(`Ramadan check: Imsak=${results.aladhan.Imsak}, Fajr=${results.aladhan.Fajr}`);
  }
})();
