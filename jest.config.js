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
