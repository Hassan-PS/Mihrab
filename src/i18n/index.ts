import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';
import sv from './locales/sv.json';
import bn from './locales/bn.json';
import ur from './locales/ur.json';
import hi from './locales/hi.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';
import tr from './locales/tr.json';
import id from './locales/id.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sv: { translation: sv },
    ar: { translation: ar },
    bn: { translation: bn },
    ur: { translation: ur },
    hi: { translation: hi },
    fr: { translation: fr },
    es: { translation: es },
    de: { translation: de },
    tr: { translation: tr },
    id: { translation: id },
    ru: { translation: ru },
    zh: { translation: zh },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
