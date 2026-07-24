import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useMessageTranslation, getLangFlag } from "../hooks/useMessageTranslation";

interface TranslatedMessageProps {
  text: string;
  sourceLang?: string;
  targetLang?: string;
  isOwn?: boolean;
  className?: string;
}

export function TranslatedMessage({ text, sourceLang, targetLang, isOwn, className }: TranslatedMessageProps) {
  const { translateMessage, language, translationEnabled } = useMessageTranslation();
  const [translated, setTranslated] = useState<string>(text);
  const [isTranslated, setIsTranslated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (isOwn || !translationEnabled || !sourceLang || sourceLang === (targetLang || language)) {
      setTranslated(text);
      setIsTranslated(false);
      fetchedRef.current = false;
      return;
    }

    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setLoading(true);
    translateMessage(text, sourceLang)
      .then((result) => {
        setTranslated(result.translated);
        setIsTranslated(result.isTranslated);
      })
      .finally(() => setLoading(false));
  }, [text, sourceLang, targetLang, language, translationEnabled, isOwn, translateMessage]);

  if (isOwn || !isTranslated) {
    return <span className={className}>{text}</span>;
  }

  return (
    <div className={className}>
      <div className="flex items-start gap-1.5">
        <span>{loading ? text : translated}</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-white/30 mt-0.5 flex-shrink-0" />}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[10px] text-white/30 flex items-center gap-0.5">
          {getLangFlag(sourceLang || "")} → {getLangFlag(targetLang || language)}
        </span>
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-0.5 transition-colors"
        >
          {showOriginal ? (
            <>Hide original <ChevronUp className="w-2.5 h-2.5" /></>
          ) : (
            <>Show original <ChevronDown className="w-2.5 h-2.5" /></>
          )}
        </button>
      </div>
      {showOriginal && (
        <div className="mt-1 text-xs text-white/40 italic">{text}</div>
      )}
    </div>
  );
}
