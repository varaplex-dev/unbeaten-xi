"use client";

import { useEffect } from "react";
import { useLocaleStore } from "@/lib/store/localeStore";
import { isRtlLocale } from "@/lib/i18n/locales";

/** Keeps the document's text direction and language in sync with the chosen
 * locale. Urdu and Pashto are right-to-left, so the whole page flips to
 * `dir="rtl"` for them; every other locale is left-to-right. Renders
 * nothing — it only touches the <html> element. */
export function LocaleDirection() {
  const locale = useLocaleStore((s) => s.locale);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [locale]);
  return null;
}
