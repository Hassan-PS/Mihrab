import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';
import sv from './locales/sv.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sv: { translation: sv },
    ar: { translation: ar },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
