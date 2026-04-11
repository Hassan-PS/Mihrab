#!/usr/bin/env node
/**
 * Runs `react-native run-android --device <serial>` for a physical device only.
 * Never starts an emulator (the RN CLI only auto-launches emulators when no
 * device arg is passed and adb reports zero devices).
 *
 * Multiple phones: set ANDROID_SERIAL to one of the listed serials.
 * Extra args: npm run android -- --verbose
 */
'use strict';

const { execSync, spawnSync } = require('child_process');

function getPhysicalDeviceIds() {
  let out;
  try {
    out = execSync('adb devices', { encoding: 'utf8' });
  } catch {
    console.error(
      'adb failed. Install Android platform-tools and add adb to your PATH.',
    );
    process.exit(1);
  }

  const lines = out.trim().split(/\n/).slice(1);
  const ids = [];
  for (const line of lines) {
    const m = line.match(/^(\S+)\s+device$/);
    if (!m) {
      continue;
    }
    const id = m[1];
    if (id.startsWith('emulator-')) {
      continue;
    }
    ids.push(id);
  }
  return ids;
}

function main() {
  const physical = getPhysicalDeviceIds();

  if (physical.length === 0) {
    console.error(
      'No physical Android device detected (emulators are ignored on purpose).',
    );
    console.error(
      'Connect your phone via USB (or wireless debugging), enable Developer options → USB debugging, accept the computer RSA prompt, then run:',
    );
    console.error('  adb devices');
    process.exit(1);
  }

  let serial = process.env.ANDROID_SERIAL;
  if (serial) {
    if (!physical.includes(serial)) {
      console.error(
        `ANDROID_SERIAL=${serial} is not among connected physical devices: ${physical.join(', ')}`,
      );
      process.exit(1);
    }
  } else if (physical.length > 1) {
    console.error('Several physical devices are connected:');
    physical.forEach(id => console.error(`  ${id}`));
    console.error(
      'Set ANDROID_SERIAL to the one you want, or disconnect the others.',
    );
    process.exit(1);
  } else {
    serial = physical[0];
  }

  const passthrough = process.argv.slice(2);
  const hasMode = passthrough.some(
    a => a === '--mode' || a.startsWith('--mode='),
  );
  const args = [
    'react-native',
    'run-android',
    '--device',
    serial,
    ...(hasMode ? passthrough : ['--mode', 'playDebug', ...passthrough]),
  ];

  console.log(`Using physical Android device: ${serial}\n`);

  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    shell: true,
    cwd: require('path').join(__dirname, '..'),
  });

  process.exit(result.status === null ? 1 : result.status);
}

main();
