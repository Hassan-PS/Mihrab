module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|@react-navigation/|react-native-sensors|react-native-svg|rxjs))',
  ],
};
