import assert from "node:assert/strict";
import test from "node:test";
import { isImageRequest, needsImageHandoff, replyLanguage, replyStrings } from "../scripts/lib/agent-language.mjs";
import { buildChatPrompt } from "../scripts/lib/agent-providers.mjs";
import { normalizeLocale, uiLocaleFromConfig } from "../app/domain/locale.mjs";

test("a reply follows the message language and falls back to the configured locale", () => {
  assert.equal(replyLanguage("Нарисуй схему сервиса", "en"), "ru");
  assert.equal(replyLanguage("Draw the service flow", "ru"), "en");
  assert.equal(replyLanguage("Добавь блок API и очередь", "en"), "ru", "mostly Cyrillic with a Latin term stays Russian");
  assert.equal(replyLanguage("👍 42", "ru"), "ru");
  assert.equal(replyLanguage("👍 42", "en"), "en");
  assert.equal(replyLanguage("", undefined), "en");
});

test("the configured locale is normalized with English as the default", () => {
  assert.equal(uiLocaleFromConfig({}), "en");
  assert.equal(uiLocaleFromConfig({ ui: { locale: "ru" } }), "ru");
  assert.equal(uiLocaleFromConfig({ ui: { locale: "ru-RU" } }), "ru");
  assert.equal(normalizeLocale("de"), "en");
  assert.equal(normalizeLocale(7), "en");
});

test("image requests are detected in English and Russian; diagrams are not images", () => {
  for (const text of [
    "Generate a watercolor picture of a fox",
    "draw me a mascot",
    "Нарисуй картинку с котом",
    "сгенерируй логотип",
    "Сделай акварельный портрет",
    "арт в стиле комикса",
    "нужна фотография моста",
  ]) {
    assert.equal(isImageRequest(text), true, text);
  }
  for (const text of [
    "Draw a sequence diagram",
    "architecture of the API",
    "Нарисуй схему сервиса",
    "Сделай диаграмму последовательности",
    "граф зависимостей",
    "add a node",
    "добавь блок",
    "партнёры и стартапы",
  ]) {
    assert.equal(isImageRequest(text), false, text);
  }
});

test("handoff markers and refusals are recognised in both languages", () => {
  assert.equal(needsImageHandoff("__CODEX_IMAGE_HANDOFF__"), true);
  assert.equal(needsImageHandoff("Sorry, I cannot create an image here."), true);
  assert.equal(needsImageHandoff("Генерация изображений здесь недоступна."), true);
  assert.equal(needsImageHandoff("К сожалению, я не могу нарисовать такую картинку."), true);
  assert.equal(needsImageHandoff("Я добавил блок на доску."), false);
  assert.equal(needsImageHandoff("Added the block."), false);
});

test("bridge reply texts and the prompt language switch together", () => {
  assert.equal(replyStrings("ru").changesPrepared, "Изменения подготовлены.");
  assert.equal(replyStrings("en").changesPrepared, "Changes prepared.");
  assert.equal(replyStrings("ru").imagesCreated(2), "Создано изображений: 2");
  assert.equal(replyStrings("ru").agentError("x"), "Ошибка агента: x");
  assert.equal(replyStrings("fr").agentError("x"), "Agent error: x");
  const args = { roomId: "r", text: "hi", board: {}, history: [], routerRules: "R", visualStyle: "S" };
  assert.match(buildChatPrompt(args), /Answer in English, briefly/);
  assert.match(buildChatPrompt({ ...args, language: "ru" }), /Answer in Russian, briefly/);
});
