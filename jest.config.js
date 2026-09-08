// Jest defaults NODE_ENV to 'test' ONLY when it is unset, and takes an
// inherited value otherwise. A shell left with NODE_ENV=production — the
// release script exports it, and so does the desktop tooling this repo is
// driven from — therefore hands every suite React's PRODUCTION build,
// which does not export `act`. The run does not error; it reports 195
// failures across 35 suites, all of them `(0, _react.act) is not a
// function`, and every one of them is a lie. Pinned here so the suite
// means the same thing whatever shell starts it.
process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // notifee_fork is a vendored submodule (notifee core source, built only by
  // the F-Droid Android build); its own test suite isn't ours to run.
  // `__tests__/fixtures/` holds data, not tests. Jest's default testMatch
  // treats everything under __tests__ as a suite, so a fixture module there
  // fails the run with "your test suite must contain at least one test".
  // Keeping fixtures beside the tests that use them is worth one line here.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/',
    '/notifee_fork/',
    '/__tests__/fixtures/',
  ],
  modulePathIgnorePatterns: ['/notifee_fork/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|@react-navigation/|react-native-sensors|react-native-svg|rxjs))',
  ],
};
