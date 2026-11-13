// UI locale ids, shared by the app (TypeScript) and the Node scripts.
// The locale is a local setting: `ui.locale` in <data dir>/config.json. English is the default.
export const UI_LOCALES = /** @type {const} */ (["en", "ru"]);
export const DEFAULT_UI_LOCALE = "en";

/**
 * @param {unknown} value
 * @returns {"en" | "ru"}
 */
export function normalizeLocale(value) {
  const id = typeof value === "string" ? value.trim().toLowerCase().split(/[-_]/)[0] : "";
  return id === "ru" ? "ru" : "en";
}

/**
 * @param {any} config the merged lab config
 * @returns {"en" | "ru"}
 */
export function uiLocaleFromConfig(config) {
  return normalizeLocale(config?.ui?.locale);
}

/**
 * BCP 47 tag for `Intl` date formatting.
 * @param {"en" | "ru"} locale
 */
export function dateLocale(locale) {
  return locale === "ru" ? "ru-RU" : "en-US";
}
