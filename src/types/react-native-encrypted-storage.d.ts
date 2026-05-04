/**
 * Ambient declaration for `react-native-encrypted-storage` — task #16.
 *
 * The package's published types are declared here so the project compiles
 * before the user runs `npm install react-native-encrypted-storage`. Once
 * the package is installed, its bundled types take precedence (this file
 * stays as a no-op fallback).
 *
 * The package exports a default object with the same async key-value API as
 * AsyncStorage. iOS uses Keychain Services; Android uses
 * EncryptedSharedPreferences from `androidx.security.crypto`. F-Droid
 * compatible (MIT-licensed, no Google Play Services).
 */
declare module 'react-native-encrypted-storage' {
  interface EncryptedStorageStatic {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
  }
  const EncryptedStorage: EncryptedStorageStatic;
  export default EncryptedStorage;
}
