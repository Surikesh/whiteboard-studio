"use client";

import { DefaultMainMenu, DefaultMainMenuContent, Editor, TldrawUiMenuActionItem, TldrawUiMenuGroup, TldrawUiMenuItem, TldrawUiMenuSubmenu } from "tldraw";
import { useEffect, useMemo, useRef } from "react";
import { OPEN_AGENT_SETTINGS_EVENT } from "../agent-chat-model.mjs";
import { LIVE_DEMO_ID, documentPath } from "../io/workspace-storage";
import { LiveShapeWrapper } from "../live-diagram";
import { createMenuActions, type MenuActionInput } from "../state/menu-actions";
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
      translations: {
        en: {
          "action.workspace-open": "Open workspace…",
          "action.workspace-new": "New diagram",
          "action.workspace-rename": "Rename…",
          "action.workspace-duplicate": "Save a copy…",
          "action.workspace-import": "Import…",
        },
      },
    }),
    [],
  );

  const menuComponents = useMemo(
    () => ({
      ShapeWrapper: LiveShapeWrapper,
      PageMenu: WorkspaceBoardSwitcher,
      MainMenu: function WorkspaceMainMenu() {
        return (
          <DefaultMainMenu>
            <TldrawUiMenuGroup id="workspace-file" label="Document">
              <TldrawUiMenuActionItem actionId="workspace-open" />
              <TldrawUiMenuActionItem actionId="workspace-new" />
              <TldrawUiMenuActionItem actionId="workspace-rename" />
              <TldrawUiMenuActionItem actionId="workspace-duplicate" />
              <TldrawUiMenuActionItem actionId="workspace-import" />
              <TldrawUiMenuSubmenu id="insert-spreadsheet" label="Insert spreadsheet">
                <TldrawUiMenuItem id="insert-empty-spreadsheet" label="New spreadsheet" onSelect={() => menuActionsRef.current.spreadsheet()} />
                <TldrawUiMenuItem id="import-spreadsheet" label="Import CSV / TSV…" onSelect={() => menuActionsRef.current.spreadsheetImport()} />
              </TldrawUiMenuSubmenu>
              <TldrawUiMenuItem
                id="agent-settings"
                label="Agent settings…"
                onSelect={() => {
                  window.dispatchEvent(new Event(OPEN_AGENT_SETTINGS_EVENT));
                }}
              />
              <TldrawUiMenuItem id="live-demo" label="Open the “Live diagram” demo" onSelect={() => window.location.assign(documentPath(LIVE_DEMO_ID))} />
              <TldrawUiMenuSubmenu id="templates" label="Insert template">
                <TldrawUiMenuItem id="service-template" label="Service architecture" onSelect={() => menuActionsRef.current.serviceTemplate()} />
              </TldrawUiMenuSubmenu>
              <TldrawUiMenuSubmenu id="export-document" label="Export">
                <TldrawUiMenuItem id="export-tldr" label="Tldraw document (.tldr)" onSelect={() => menuActionsRef.current.exportTldr()} />
                <TldrawUiMenuItem id="export-png" label="PNG image" onSelect={() => menuActionsRef.current.exportPng()} />
                <TldrawUiMenuItem id="export-svg" label="SVG vector" onSelect={() => menuActionsRef.current.exportSvg()} />
                <TldrawUiMenuItem id="export-json" label="Snapshot JSON" onSelect={() => menuActionsRef.current.exportSnapshot()} />
              </TldrawUiMenuSubmenu>
              <TldrawUiMenuItem id="copy-link" label="Copy link" onSelect={() => menuActionsRef.current.copyLink()} />
              <TldrawUiMenuItem id="copy-id" label="Copy ID" onSelect={() => menuActionsRef.current.copyId()} />
              <TldrawUiMenuItem id="focus-mode" label="Hide interface" kbd="⌘\\" onSelect={() => menuActionsRef.current.focus()} />
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
