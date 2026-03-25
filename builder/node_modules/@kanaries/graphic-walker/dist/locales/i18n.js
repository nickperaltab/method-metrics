import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import localeEnUs from './en-US.json';
import localeJaJp from './ja-JP.json';
import localeZhCn from './zh-CN.json';
const locales = {
    'en': {
        translation: localeEnUs,
    },
    'en-US': {
        translation: localeEnUs,
    },
    'zh': {
        translation: localeZhCn,
    },
    'zh-CN': {
        translation: localeZhCn,
    },
    'ja': {
        translation: localeJaJp,
    },
    'ja-JP': {
        translation: localeJaJp,
    }
};
i18n.use(initReactI18next).use(LanguageDetector).init({
    fallbackLng: 'en-US',
    interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
    },
    resources: locales,
});
const loadedLangs = []; // exclude built-in keys to enable rewrite
export const mergeLocaleRes = (resources) => {
    for (const lang in resources) {
        if (Object.prototype.hasOwnProperty.call(resources, lang)) {
            if (loadedLangs.includes(lang)) {
                continue;
            }
            loadedLangs.push(lang);
            const resource = resources[lang];
            i18n.addResourceBundle(lang, 'translation', resource, false, true);
        }
    }
};
export const setLocaleLanguage = (lang) => {
    return i18n.changeLanguage(lang);
};
//# sourceMappingURL=i18n.js.map