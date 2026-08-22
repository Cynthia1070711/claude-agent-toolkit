// ============================================================
// I18nProvider.tsx — 輕量 i18n Context + Hook
// 預設 zh-TW，localStorage 持久化語系選擇
// ============================================================
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import zhTW, { type Locale } from './zh-TW';
import en from './en';

export type LangCode = 'zh-TW' | 'en';

const LOCALES: Record<LangCode, Locale> = {
  'zh-TW': zhTW,
  'en': en,
};

const STORAGE_KEY = 'dvc-lang';

function getInitialLang(): LangCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'zh-TW') return stored;
  return 'zh-TW';
}

interface I18nContextValue {
  lang: LangCode;
  t: Locale;
  setLang: (lang: LangCode) => void;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(getInitialLang);

  const setLang = useCallback((newLang: LangCode) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
    document.documentElement.lang = newLang;
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'zh-TW' ? 'en' : 'zh-TW');
  }, [lang, setLang]);

  const value: I18nContextValue = {
    lang,
    t: LOCALES[lang],
    setLang,
    toggleLang,
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
