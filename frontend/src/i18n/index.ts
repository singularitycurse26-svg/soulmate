import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";

export const SUPPORTED_LANGUAGES = [
  { code: "en", flag: "🇺🇸", name: "English", nativeName: "English" },
  { code: "es", flag: "🇲🇽", name: "Spanish", nativeName: "Español" },
  { code: "pt", flag: "🇧🇷", name: "Portuguese", nativeName: "Português" },
  { code: "zh", flag: "🇨🇳", name: "Chinese (Simplified)", nativeName: "中文(简体)" },
  { code: "zh-HK", flag: "🇭🇰", name: "Chinese (Traditional)", nativeName: "中文(繁體)" },
  { code: "hi", flag: "🇮🇳", name: "Hindi", nativeName: "हिन्दी" },
] as const;

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: LANGUAGE_CODES,
    ns: ["common", "wallet", "dating", "social", "phone", "email", "marketplace"],
    defaultNS: "common",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "language",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
