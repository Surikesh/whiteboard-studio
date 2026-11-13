"use client";

import { DefaultMainMenu, DefaultMainMenuContent, Editor, TldrawUiMenuActionItem, TldrawUiMenuGroup, TldrawUiMenuItem, TldrawUiMenuSubmenu } from "tldraw";
import { useEffect, useMemo, useRef } from "react";
import { OPEN_AGENT_SETTINGS_EVENT } from "../agent-chat-model.mjs";
import { LIVE_DEMO_ID, documentPath } from "../io/workspace-storage";
import { LiveShapeWrapper } from "../live-diagram";
import { createMenuActions, type MenuActionInput } from "../state/menu-actions";
import { useT } from "../domain/i18n";
import { MESSAGES } from "../domain/messages.mjs";
import { WorkspaceBoardSwitcher } from "./board-switcher";

export function useMainMenu(input: MenuActionInput) {
  // One registry definition; the ref is refreshed after every committed render so stable menu callbacks never run stale handlers.
  const menuActions = createMenuActions(input);
  const menuActionsRef = useRef(menuActions);
  useEffect(() => {
    menuActionsRef.current = menuActions;
  });

  const uiOverrides = useMemo(
    () => ({
      actions: (_editor: Editor, actions: Record<string, unknown>) => ({
        ...actions,
        "workspace-open": { id: "workspace-open", label: "action.workspace-open", kbd: "cmd+k,ctrl+k", onSelect: () => menuActionsRef.current.openWorkspace() },
        "workspace-new": { id: "workspace-new", label: "action.workspace-new", onSelect: () => menuActionsRef.current.createDocument() },
        "workspace-rename": { id: "workspace-rename", label: "action.workspace-rename", onSelect: () => menuActionsRef.current.renameCurrent() },
        "workspace-duplicate": { id: "workspace-duplicate", label: "action.workspace-duplicate", onSelect: () => menuActionsRef.current.duplicateCurrent() },
        "workspace-import": { id: "workspace-import", label: "action.workspace-import", onSelect: () => menuActionsRef.current.importDocument() },
      }),
      // tldraw picks the table for its `locale` prop; both come from the shared dictionary.
      translations: { en: actionTexts("en"), ru: actionTexts("ru") },
    }),
    [],
  );

  const menuComponents = useMemo(
    () => ({
      ShapeWrapper: LiveShapeWrapper,
      PageMenu: WorkspaceBoardSwitcher,
      MainMenu: function WorkspaceMainMenu() {
        const t = useT();
        return (
          <DefaultMainMenu>
            <TldrawUiMenuGroup id="workspace-file" label={t("menu.document")}>
              <TldrawUiMenuActionItem actionId="workspace-open" />
              <TldrawUiMenuActionItem actionId="workspace-new" />
              <TldrawUiMenuActionItem actionId="workspace-rename" />
              <TldrawUiMenuActionItem actionId="workspace-duplicate" />
              <TldrawUiMenuActionItem actionId="workspace-import" />
              <TldrawUiMenuSubmenu id="insert-spreadsheet" label={t("menu.insertSpreadsheet")}>
                <TldrawUiMenuItem id="insert-empty-spreadsheet" label={t("menu.newSpreadsheet")} onSelect={() => menuActionsRef.current.spreadsheet()} />
                <TldrawUiMenuItem id="import-spreadsheet" label={t("menu.importSpreadsheet")} onSelect={() => menuActionsRef.current.spreadsheetImport()} />
              </TldrawUiMenuSubmenu>
              <TldrawUiMenuItem
                id="agent-settings"
                label={t("menu.agentSettings")}
                onSelect={() => {
                  window.dispatchEvent(new Event(OPEN_AGENT_SETTINGS_EVENT));
                }}
              />
              <TldrawUiMenuItem id="live-demo" label={t("menu.liveDemo")} onSelect={() => window.location.assign(documentPath(LIVE_DEMO_ID))} />
              <TldrawUiMenuSubmenu id="templates" label={t("menu.insertTemplate")}>
                <TldrawUiMenuItem id="service-template" label={t("menu.serviceTemplate")} onSelect={() => menuActionsRef.current.serviceTemplate()} />
              </TldrawUiMenuSubmenu>
              <TldrawUiMenuSubmenu id="export-document" label={t("menu.export")}>
                <TldrawUiMenuItem id="export-tldr" label={t("menu.exportTldr")} onSelect={() => menuActionsRef.current.exportTldr()} />
                <TldrawUiMenuItem id="export-png" label={t("menu.exportPng")} onSelect={() => menuActionsRef.current.exportPng()} />
                <TldrawUiMenuItem id="export-svg" label={t("menu.exportSvg")} onSelect={() => menuActionsRef.current.exportSvg()} />
                <TldrawUiMenuItem id="export-json" label={t("menu.exportJson")} onSelect={() => menuActionsRef.current.exportSnapshot()} />
              </TldrawUiMenuSubmenu>
              <TldrawUiMenuItem id="copy-link" label={t("menu.copyLink")} onSelect={() => menuActionsRef.current.copyLink()} />
              <TldrawUiMenuItem id="copy-id" label={t("menu.copyId")} onSelect={() => menuActionsRef.current.copyId()} />
              <TldrawUiMenuItem id="focus-mode" label={t("menu.focus")} kbd="⌘\\" onSelect={() => menuActionsRef.current.focus()} />
            </TldrawUiMenuGroup>
            <DefaultMainMenuContent />
          </DefaultMainMenu>
        );
      },
    }),
    [],
  );
  return { uiOverrides, menuComponents };
}

const ACTION_KEYS = ["action.workspace-open", "action.workspace-new", "action.workspace-rename", "action.workspace-duplicate", "action.workspace-import"] as const;

function actionTexts(locale: keyof typeof MESSAGES) {
  return Object.fromEntries(ACTION_KEYS.map((key) => [key, MESSAGES[locale][key]]));
}
