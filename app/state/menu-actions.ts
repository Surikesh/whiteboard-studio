export type MenuActionInput = {
  openWorkspace: () => void;
  createDocument: () => void;
  renameCurrent: () => void;
  duplicateCurrent: () => void;
  importDocument: () => void;
  exportTldr: () => void;
  exportImage: (format: "png" | "svg") => void;
  exportSnapshot: () => void;
  copyLink: () => void;
  copyId: () => void;
  focus: () => void;
  serviceTemplate: () => void;
  spreadsheet: () => void;
  spreadsheetImport: () => void;
};

// The single definition of the menu action registry; the composition refreshes a ref with it after every commit.
export function createMenuActions(input: MenuActionInput) {
  return {
    openWorkspace: () => input.openWorkspace(),
    createDocument: () => input.createDocument(),
    renameCurrent: () => input.renameCurrent(),
    duplicateCurrent: () => input.duplicateCurrent(),
    importDocument: () => input.importDocument(),
    exportTldr: () => input.exportTldr(),
    exportPng: () => input.exportImage("png"),
    exportSvg: () => input.exportImage("svg"),
    exportSnapshot: () => input.exportSnapshot(),
    copyLink: () => input.copyLink(),
    copyId: () => input.copyId(),
    focus: () => input.focus(),
    serviceTemplate: () => input.serviceTemplate(),
    spreadsheet: () => input.spreadsheet(),
    spreadsheetImport: () => input.spreadsheetImport(),
  };
}
