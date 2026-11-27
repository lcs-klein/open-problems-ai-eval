import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthorType, CategoryCode, GovernanceStatus } from '@opae/core';
import zhCatalog from './zhCatalog.json';

export type Locale = 'en' | 'zh';
export type ZhKey = keyof typeof zhCatalog;

const LOCALE_STORAGE_KEY = 'opae_ui_locale_v1';

const CAT_KEYS: Record<CategoryCode, ZhKey> = {
  F: 'cat.F',
  T: 'cat.T',
  V: 'cat.V',
  D: 'cat.D',
  L: 'cat.L',
  I: 'cat.I',
  P: 'cat.P',
};

const GOV_KEYS: Record<GovernanceStatus, ZhKey> = {
  draft: 'gov.draft',
  screening_recommendation: 'gov.screening_recommendation',
  under_human_review: 'gov.under_human_review',
  moderator_approved: 'gov.moderator_approved',
  rejected: 'gov.rejected',
};

const AUTHOR_KEYS: Record<AuthorType, ZhKey> = {
  human: 'author.human',
  ai_assisted: 'author.ai_assisted',
  machine_generated: 'author.machine_generated',
};

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`
  );
}

export interface LocaleContextValue {
  locale: Locale;
  isZh: boolean;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (key: ZhKey, enText: string, vars?: Record<string, string | number>) => string;
  catLabel: (code: CategoryCode, fallbackEn?: string) => string;
  govLabel: (status: GovernanceStatus, fallbackEn?: string) => string;
  authorLabel: (type: AuthorType, fallbackEn?: string) => string;
}

const defaultT = (_key: ZhKey, enText: string, vars?: Record<string, string | number>) =>
  interpolate(enText, vars);

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  isZh: false,
  setLocale: () => {},
  toggleLocale: () => {},
  t: defaultT,
  catLabel: (code, fallbackEn) => fallbackEn ?? code,
  govLabel: (status, fallbackEn) => fallbackEn ?? status,
  authorLabel: (type, fallbackEn) => fallbackEn ?? type,
});

function readStoredLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Ignore storage access issues
  }
  return 'en';
}

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore storage access issues
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === 'en' ? 'zh' : 'en'));
  }, []);

  const t = useCallback(
    (key: ZhKey, enText: string, vars?: Record<string, string | number>) => {
      const raw = locale === 'zh' ? zhCatalog[key] : enText;
      return interpolate(raw, vars);
    },
    [locale]
  );

  const catLabel = useCallback(
    (code: CategoryCode, fallbackEn?: string) => {
      if (locale === 'zh' && CAT_KEYS[code]) {
        return zhCatalog[CAT_KEYS[code]];
      }
      return fallbackEn ?? code;
    },
    [locale]
  );

  const govLabel = useCallback(
    (status: GovernanceStatus, fallbackEn?: string) => {
      if (locale === 'zh' && GOV_KEYS[status]) {
        return zhCatalog[GOV_KEYS[status]];
      }
      return fallbackEn ?? status;
    },
    [locale]
  );

  const authorLabel = useCallback(
    (type: AuthorType, fallbackEn?: string) => {
      if (locale === 'zh' && AUTHOR_KEYS[type]) {
        return zhCatalog[AUTHOR_KEYS[type]];
      }
      return fallbackEn ?? type;
    },
    [locale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      isZh: locale === 'zh',
      setLocale,
      toggleLocale,
      t,
      catLabel,
      govLabel,
      authorLabel,
    }),
    [locale, setLocale, toggleLocale, t, catLabel, govLabel, authorLabel]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Style 1: Subtle text-only ghost button placed at the top-right corner */
export const LanguageToggle: React.FC = () => {
  const { locale, toggleLocale } = useLocale();
  const label = locale === 'en' ? zhCatalog['lang.shortZh'] : 'EN';
  const title = locale === 'en' ? zhCatalog['lang.switchToZh'] : 'Switch to English';

  return (
    <button
      type="button"
      className="ed-lang-btn"
      onClick={toggleLocale}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
};
