"use client";

import { useLocaleStore } from "@/lib/store/localeStore";
import { getDictionary, type TranslationKey } from "@/lib/i18n";

export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const dict = getDictionary(locale);
  function t(key: TranslationKey): string {
    return dict[key];
  }
  return { t, locale };
}
