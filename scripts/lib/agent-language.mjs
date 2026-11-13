// Language handling for agent chat replies.
// Rule: a reply uses the language of the user's message (Cyrillic letters: Russian, Latin letters: English);
// a message without letters (an emoji, a number) falls back to the configured UI locale.
import { normalizeLocale } from "../../app/domain/locale.mjs";

const CYRILLIC = /[а-яё]/i;
const LATIN = /[a-z]/i;

/**
 * @param {string} text
 * @param {unknown} fallback configured UI locale
 * @returns {"en" | "ru"}
 */
export function replyLanguage(text, fallback = "en") {
  const value = String(text ?? "");
  const cyrillic = (value.match(/[а-яё]/gi) ?? []).length;
  const latin = (value.match(/[a-z]/gi) ?? []).length;
  if (!CYRILLIC.test(value) && !LATIN.test(value)) return normalizeLocale(fallback);
  return cyrillic >= latin ? "ru" : "en";
}

// `\b` is ASCII-only in JavaScript, so Russian stems use explicit Cyrillic lookarounds.
const DIAGRAM_WORDS = /diagram|chart|graph|flowchart|sequence|architecture|mind.?map|диаграм|схем|(?<![а-яё])граф|архитектур|майнд.?мап|ментальн[а-яё]* карт/;
const IMAGE_WORDS =
  /picture|image\b|illustrat|photo|portrait|mascot|sticker|avatar|logo|pencil|watercolor|artwork|\bart\b|draw me|generate|картин|изображени|иллюстрац|фото|портрет|маскот|стикер|аватар|логотип|карандаш|акварел|(?<![а-яё])арт(?![а-яё])|нарису|сгенерир/;

/** True for a request for a raster picture rather than an editable diagram. */
export function isImageRequest(text) {
  const value = String(text ?? "").toLowerCase();
  if (DIAGRAM_WORDS.test(value)) return false;
  return IMAGE_WORDS.test(value);
}

/** True when a chat provider answered an image request with the handoff marker or a refusal. */
export function needsImageHandoff(text) {
  return (
    /__CODEX_IMAGE_HANDOFF__/.test(text) ||
    /image_gen|generation[^.]{0,40}unavailable|(?:can't|cannot|unable to).{0,40}(?:image|picture)/i.test(text) ||
    /генерац[^.]{0,40}(?:недоступ|не доступ|не поддерж)|не (?:могу|умею).{0,40}(?:изображ|картин|нарисова|сгенерир)/i.test(text)
  );
}

const STRINGS = {
  en: {
    changesPrepared: "Changes prepared.",
    imagesCreated: (/** @type {number} */ count) => `Images created: ${count}`,
    backgroundKept: "Could not remove the background (no Codex background-removal helper available); the image was published as is.",
    agentError: (/** @type {string} */ message) => `Agent error: ${message}`,
  },
  ru: {
    changesPrepared: "Изменения подготовлены.",
    imagesCreated: (/** @type {number} */ count) => `Создано изображений: ${count}`,
    backgroundKept: "Фон убрать не удалось (нет помощника Codex для удаления фона), изображение опубликовано как есть.",
    agentError: (/** @type {string} */ message) => `Ошибка агента: ${message}`,
  },
};

/** Bridge-authored reply texts. Provider error details stay as the provider or tool wrote them. */
export function replyStrings(language) {
  return STRINGS[normalizeLocale(language)];
}
