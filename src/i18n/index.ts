import { createContext, useContext } from "react";
import { Locale, translations } from "./locales";

export type { Locale };

export interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: "zh",
  setLocale: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function createT(locale: Locale) {
  return (key: string, params?: Record<string, string>): string => {
    let text = translations[locale]?.[key] ?? translations["zh"]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  };
}
