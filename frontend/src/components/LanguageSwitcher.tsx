import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Globe, X, Check, Search, Languages } from "lucide-react";
import { useStore } from "../lib/store";
import { SUPPORTED_LANGUAGES } from "../i18n";
import { translateApi } from "../lib/api";

export function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { i18n, t } = useTranslation();
  const { language, setLanguage, translationEnabled, setTranslationEnabled } = useStore();

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  const filtered = useMemo(() => {
    if (!search) return SUPPORTED_LANGUAGES;
    const q = search.toLowerCase();
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSelect = (code: string) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    translateApi.setLanguage(code).catch(() => {});
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-sm font-medium text-white/80 transition-colors"
        title={t("language.selectLanguage")}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{currentLang.flag}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-white/10 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold text-white">{t("language.selectLanguage")}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("language.searchLanguage")}
                  className="w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-colors"
                />
              </div>

              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filtered.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleSelect(lang.code)}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      language === lang.code
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "text-white/70 hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{lang.flag}</span>
                      <div className="text-left">
                        <div className="font-medium">{lang.nativeName}</div>
                        <div className="text-xs text-white/40">{lang.name}</div>
                      </div>
                    </div>
                    {language === lang.code && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="text-center text-white/30 text-sm py-4">No languages found</div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white/80 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-indigo-400" />
                      {t("language.autoTranslate")}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">{t("language.autoTranslateDesc")}</div>
                  </div>
                  <button
                    onClick={() => setTranslationEnabled(!translationEnabled)}
                    className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ml-3 ${
                      translationEnabled ? "bg-indigo-500" : "bg-white/10"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        translationEnabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
