"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang, LocalizedText } from "@/domain/types";
import { DEFAULT_LANG, localized, translate, type TKey, type TVars } from "./translate";

const STORAGE_KEY = "immunization-roadmap-lang";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: TVars) => string;
  /** Untyped variant for dynamically composed keys (e.g. status values). */
  td: (key: string, vars?: TVars) => string;
  loc: (text: LocalizedText | undefined) => string;
  formatDate: (iso: string | undefined) => string;
  formatDateTime: (iso: string | undefined) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "nl" || stored === "en") setLangState(stored);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const locale = lang === "nl" ? "nl-NL" : "en-GB";
    return {
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      td: (key, vars) => translate(lang, key, vars),
      loc: (text) => localized(text, lang),
      formatDate: (iso) => {
        if (!iso) return "—";
        const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
      },
      formatDateTime: (iso) => {
        if (!iso) return "—";
        const d = new Date(iso);
        return Number.isNaN(d.getTime())
          ? iso
          : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
