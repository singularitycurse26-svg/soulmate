import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "../lib/store";
import { translateApi } from "../lib/api";

const LANG_FLAGS: Record<string, string> = {
  en: "🇺🇸", es: "🇲🇽", pt: "🇧🇷", zh: "🇨🇳", "zh-HK": "🇭🇰", hi: "🇮🇳",
  ar: "🇸🇦", fr: "🇫🇷", de: "🇩🇪", ja: "🇯🇵", ko: "🇰🇷", ru: "🇷🇺",
  it: "🇮🇹", tr: "🇹🇷", vi: "🇻🇳", th: "🇹🇭", id: "🇮🇩", ms: "🇲🇾",
  nl: "🇳🇱", pl: "🇵🇱", bn: "🇧🇩", ta: "🇮🇳", te: "🇮🇳", mr: "🇮🇳",
  gu: "🇮🇳", pa: "🇮🇳",
};

export function getLangFlag(lang: string): string {
  return LANG_FLAGS[lang] || "🌐";
}

export interface TranslatableMessage {
  id: number;
  text: string;
  source_lang?: string;
  from_user?: number;
}

export function useMessageTranslation() {
  const { language, translationEnabled } = useStore();
  const cacheRef = useRef<Map<string, string>>(new Map());

  const shouldTranslate = useCallback(
    (sourceLang?: string) => {
      if (!translationEnabled) return false;
      if (!sourceLang) return false;
      if (sourceLang === language) return false;
      return true;
    },
    [translationEnabled, language]
  );

  const translateMessage = useCallback(
    async (text: string, sourceLang?: string): Promise<{ translated: string; isTranslated: boolean }> => {
      if (!shouldTranslate(sourceLang)) {
        return { translated: text, isTranslated: false };
      }

      const cacheKey = `${text}:${sourceLang}:${language}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        return { translated: cached, isTranslated: true };
      }

      try {
        const result = await translateApi.translate(text, language, sourceLang);
        if (result.translated && result.translated !== text) {
          cacheRef.current.set(cacheKey, result.translated);
          return { translated: result.translated, isTranslated: true };
        }
      } catch {
        // Fall back to original text
      }
      return { translated: text, isTranslated: false };
    },
    [language, shouldTranslate]
  );

  const translateBatch = useCallback(
    async (messages: TranslatableMessage[]): Promise<Map<number, { translated: string; isTranslated: boolean }>> => {
      const result = new Map<number, { translated: string; isTranslated: boolean }>();

      if (!translationEnabled) {
        messages.forEach((m) => result.set(m.id, { translated: m.text, isTranslated: false }));
        return result;
      }

      const toTranslate: TranslatableMessage[] = [];
      messages.forEach((m) => {
        if (!shouldTranslate(m.source_lang)) {
          result.set(m.id, { translated: m.text, isTranslated: false });
        } else {
          const cacheKey = `${m.text}:${m.source_lang}:${language}`;
          const cached = cacheRef.current.get(cacheKey);
          if (cached) {
            result.set(m.id, { translated: cached, isTranslated: true });
          } else {
            toTranslate.push(m);
          }
        }
      });

      if (toTranslate.length > 0) {
        try {
          const batchResult = await translateApi.translateBatch(
            toTranslate.map((m) => ({ id: m.id, text: m.text, source_lang: m.source_lang })),
            language
          );
          if (batchResult.translations) {
            batchResult.translations.forEach((t: any) => {
              const msg = toTranslate.find((m) => m.id === t.id);
              if (msg && t.translated && t.translated !== msg.text) {
                const cacheKey = `${msg.text}:${msg.source_lang}:${language}`;
                cacheRef.current.set(cacheKey, t.translated);
                result.set(t.id, { translated: t.translated, isTranslated: true });
              } else {
                result.set(t.id, { translated: msg?.text || t.translated, isTranslated: false });
              }
            });
          }
        } catch {
          toTranslate.forEach((m) => result.set(m.id, { translated: m.text, isTranslated: false }));
        }
      }

      return result;
    },
    [language, translationEnabled, shouldTranslate]
  );

  return { translateMessage, translateBatch, shouldTranslate, language, translationEnabled };
}
