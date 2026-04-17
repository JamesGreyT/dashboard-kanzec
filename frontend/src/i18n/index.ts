/**
 * i18n init. Three languages: Uzbek (Latin), Russian, English.
 * Default fallback is English (for strings we haven't yet translated).
 * Chosen language is persisted to localStorage under `kanzec.lang` and
 * detected from the browser on first load.
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import uz from "./locales/uz.json";
import ru from "./locales/ru.json";

export type Lang = "en" | "uz" | "ru";

export const LANG_STORAGE_KEY = "kanzec.lang";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uz: { translation: uz },
      ru: { translation: ru },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "uz", "ru"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
    },
    returnNull: false,
  });

export default i18n;
