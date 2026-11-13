import { useCallback, useSyncExternalStore } from "react";
import { dateLocale, normalizeLocale } from "./locale.mjs";
import { MESSAGES, translate } from "./messages.mjs";

export type UiLocale = "en" | "ru";
export type MessageKey = keyof typeof MESSAGES.en;
type Vars = Record<string, string | number>;

// The single owner of the active UI locale in the browser. React reads it through useUiLocale();
// non-React code (prompts, spec loaders, new spreadsheets) reads it through getUiLocale()/t().
let active: UiLocale = "en";
const listeners = new Set<() => void>();

export function getUiLocale(): UiLocale {
  return active;
}

export function setUiLocale(value: unknown) {
  const next = normalizeLocale(value);
  if (next === active) return;
  active = next;
  if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: MessageKey, vars?: Vars) {
  return translate(active, key, vars);
}

export function useUiLocale(): UiLocale {
  return useSyncExternalStore(subscribe, getUiLocale, () => "en");
}

export function useT() {
  const locale = useUiLocale();
  return useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
}

export function formatDate(value: string | number | Date, locale: UiLocale, withTime = false) {
  const date = new Date(value);
  return withTime ? date.toLocaleString(dateLocale(locale)) : date.toLocaleDateString(dateLocale(locale));
}
