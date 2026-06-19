module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // notifee_fork is a vendored submodule (notifee core source, built only by
  // the F-Droid Android build); its own test suite isn't ours to run.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/notifee_fork/'],
  modulePathIgnorePatterns: ['/notifee_fork/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|@react-navigation/|react-native-sensors|react-native-svg|rxjs))',
  ],
};
