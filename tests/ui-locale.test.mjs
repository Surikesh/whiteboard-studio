import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MESSAGES, translate } from "../app/domain/messages.mjs";
import { chatHint, chatState, chatSubtitle } from "../app/agent-chat-model.mjs";
import { labPaths } from "../scripts/lib/lab-config.mjs";
import { uiConfigBody } from "../scripts/ui-config-plugin.mjs";
import { createLabEditor } from "./helpers/headless-editor.mjs";
import { loadAppModule } from "./helpers/load-app.mjs";

test("every English UI text has a Russian translation", () => {
  assert.deepEqual(Object.keys(MESSAGES.ru).sort(), Object.keys(MESSAGES.en).sort());
  for (const [key, value] of Object.entries(MESSAGES.ru)) assert.ok(value.trim(), key);
  for (const [key, value] of Object.entries(MESSAGES.en)) assert.equal(/[а-яё]/i.test(value), false, `${key} is English`);
});

test("translate fills placeholders and falls back to English", () => {
  assert.equal(translate("ru", "library.open", { title: "Demo" }), "Открыть схему «Demo»");
  assert.equal(translate("en", "components.items", { count: 3 }), "3 items");
  assert.equal(translate("de", "table.criterion"), "Criterion");
  assert.equal(translate(undefined, "status.saved"), "Saved");
});

test("chat status texts follow the locale", () => {
  const off = chatState({ enabled: false, chat: { configured: true } });
  assert.equal(chatSubtitle(off), "agent access is off");
  assert.equal(chatSubtitle(off, "ru"), "доступ агента выключен");
  assert.match(chatHint(chatState(null), "ru"), /провайдер/);
});

test("the ui-config route reads ui.locale from config.json and defaults to English", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ws-ui-locale-"));
  const paths = labPaths(root);
  assert.deepEqual(uiConfigBody(paths), { locale: "en" }, "no config file");
  mkdirSync(root, { recursive: true });
  writeFileSync(paths.config, JSON.stringify({ ui: { locale: "ru" } }));
  assert.deepEqual(uiConfigBody(paths), { locale: "ru" });
  writeFileSync(paths.config, JSON.stringify({ ui: { locale: "fr" } }));
  assert.deepEqual(uiConfigBody(paths), { locale: "en" }, "unsupported locale");
  writeFileSync(paths.config, "{ not json");
  assert.deepEqual(uiConfigBody(paths), { locale: "en" }, "broken config");
});

test("the locale store drives non-React texts such as the table criterion header", async () => {
  const app = await loadAppModule("tests/helpers/i18n-entry.ts");
  const lab = await createLabEditor();
  assert.equal(app.getUiLocale(), "en");
  const table = { format: "whiteboard-studio/v1", diagramType: "comparison", nodes: [], table: { columns: ["A"], rows: [{ label: "Cost", values: ["1"] }] } };
  const headerTexts = (editor) =>
    editor
      .getCurrentPageShapes()
      .filter((shape) => shape.type === "geo")
      .map((shape) => JSON.stringify(shape.props.richText));
  const english = lab.newEditor();
  app.loadDiagramSpec(english, table);
  assert.ok(headerTexts(english).some((text) => text.includes("Criterion")));
  app.setUiLocale("ru-RU");
  assert.equal(app.getUiLocale(), "ru");
  assert.equal(app.t("status.saved"), "Сохранено");
  const russian = lab.newEditor();
  app.loadDiagramSpec(russian, table);
  assert.ok(headerTexts(russian).some((text) => text.includes("Критерий")));
  app.setUiLocale("en");
});
