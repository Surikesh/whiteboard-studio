"use client";

import { BaseBoxShapeUtil, Editor, HTMLContainer, RecordProps, T, TLShape, createShapeId, useEditor, useValue } from "tldraw";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "@univerjs/preset-sheets-core/lib/index.css";

export const SPREADSHEET_TYPE = "spreadsheet";

export type SpreadsheetShape = TLShape<typeof SPREADSHEET_TYPE>;

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [SPREADSHEET_TYPE]: {
      w: number;
      h: number;
      title: string;
      workbook: string;
      previewZoom?: number;
    };
  }
}

type CellData = Record<number, Record<number, { v?: string | number; f?: string }>>;

function initialWorkbook(title: string) {
  const sheetId = `sheet-${crypto.randomUUID()}`;
  return {
    id: `workbook-${crypto.randomUUID()}`,
    name: title,
    appVersion: "0.25.1",
    locale: LocaleType.EN_US,
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "Sheet 1",
        rowCount: 100,
        columnCount: 26,
        cellData: {
          0: { 0: { v: "New spreadsheet" }, 1: { v: "Value" } },
          1: { 0: { v: "Example" }, 1: { v: 1 } },
          2: { 0: { v: "Formula" }, 1: { f: "=B2*2" } },
        } as CellData,
      },
    },
  };
}

function parseWorkbook(value: string, title: string) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && parsed.sheets) return parsed;
  } catch {
    /* create a fresh workbook below */
  }
  return initialWorkbook(title);
}

function previewRows(value: string, rowCount: number, columnCount: number): Array<Array<string>> {
  try {
    const workbook = JSON.parse(value);
    const sheet = workbook.sheets?.[workbook.sheetOrder?.[0]] ?? Object.values(workbook.sheets ?? {})[0];
    const data = (sheet as { cellData?: Record<string, Record<string, { v?: unknown; f?: string }>> })?.cellData ?? {};
    return Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) => {
        const cell = data[row]?.[column];
        return String(cell?.v ?? cell?.f ?? "");
      }),
    );
  } catch {
    return []; // malformed workbook JSON: render an empty preview
  }
}

function columnLabel(index: number) {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}

function SpreadsheetView({ shape }: { shape: SpreadsheetShape }) {
  const editor = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const latestWorkbook = useRef(shape.props.workbook);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isEditing = useValue("editing spreadsheet", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);

  useEffect(() => {
    if (!isEditing || !containerRef.current) return;
    const { univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS) },
      presets: [UniverSheetsCorePreset({ container: containerRef.current })],
    });
    univerAPI.createWorkbook(parseWorkbook(latestWorkbook.current, shape.props.title));
    const subscription = univerAPI.onCommandExecuted(() => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const workbook = univerAPI.getActiveWorkbook();
        if (!workbook) return;
        latestWorkbook.current = JSON.stringify(workbook.save());
        editor.updateShape({
          id: shape.id,
          type: SPREADSHEET_TYPE,
          props: { workbook: latestWorkbook.current },
        });
      }, 450);
    });
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const workbook = univerAPI.getActiveWorkbook();
      if (workbook) {
        latestWorkbook.current = JSON.stringify(workbook.save());
        editor.updateShape({ id: shape.id, type: SPREADSHEET_TYPE, props: { workbook: latestWorkbook.current } });
      }
      subscription.dispose();
      univerAPI.dispose();
    };
    // Recreate Univer only when entering editing mode. Remote data changes are
    // picked up next time, avoiding destruction while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shape.props.title only seeds a new workbook; recreating Univer on remote changes would destroy it mid-edit
  }, [isEditing, isFullscreen, editor, shape.id]);

  const previewZoom = shape.props.previewZoom ?? 1;
  const visibleColumnCount = Math.max(2, Math.min(20, Math.ceil((shape.props.w - 42) / (128 * previewZoom))));
  const visibleRowCount = Math.max(3, Math.min(40, Math.ceil((shape.props.h - 66) / (32 * previewZoom))));
  const rows = previewRows(shape.props.workbook, visibleRowCount, visibleColumnCount);
  const rename = () => {
    const title = window.prompt("Spreadsheet title", shape.props.title)?.trim();
    if (title && title !== shape.props.title) editor.updateShape({ id: shape.id, type: SPREADSHEET_TYPE, props: { title } });
  };
  const changePreviewZoom = (change: number) => {
    const next = Math.max(0.5, Math.min(1.75, Math.round((previewZoom + change) * 100) / 100));
    editor.updateShape({ id: shape.id, type: SPREADSHEET_TYPE, props: { previewZoom: next } });
  };
  const editorSurface = isEditing && (
    <div className={isFullscreen ? "spreadsheet-fullscreen" : "spreadsheet-shape__editor"} onPointerDown={(event) => event.stopPropagation()}>
      <header>
        <button type="button" className="spreadsheet-title-button" onClick={rename} title="Rename spreadsheet">
          {shape.props.title}
        </button>
        <span>Changes are saved automatically</span>
        <button type="button" onClick={() => setIsFullscreen((value) => !value)}>
          {isFullscreen ? "Back to canvas" : "Full screen"}
        </button>
      </header>
      <div ref={containerRef} className="spreadsheet-shape__univer" />
    </div>
  );
  return (
    <HTMLContainer
      className={`spreadsheet-shape${isEditing ? " is-editing" : ""}`}
      style={{ pointerEvents: isEditing ? "all" : "none" }}
      onPointerDown={isEditing ? (event) => event.stopPropagation() : undefined}
      onDoubleClick={isEditing ? (event) => event.stopPropagation() : undefined}
    >
      {!isFullscreen && (
        <header>
          <button type="button" className="spreadsheet-title-button" onPointerDown={(event) => event.stopPropagation()} onClick={rename} title="Rename spreadsheet">
            {shape.props.title}
          </button>
          {isEditing ? (
            <span>Esc to leave the spreadsheet</span>
          ) : (
            <div className="spreadsheet-preview-tools" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" aria-label="Zoom out spreadsheet preview" onClick={() => changePreviewZoom(-0.15)}>
                −
              </button>
              <span>{Math.round(previewZoom * 100)}%</span>
              <button type="button" aria-label="Zoom in spreadsheet preview" onClick={() => changePreviewZoom(0.15)}>
                +
              </button>
              <button type="button" onClick={() => editor.setEditingShape(shape.id)}>
                Edit
              </button>
            </div>
          )}
        </header>
      )}
      {isEditing ? (
        isFullscreen ? (
          createPortal(editorSurface, document.body)
        ) : (
          editorSurface
        )
      ) : (
        <div className="spreadsheet-shape__preview">
          <table style={{ transform: `scale(${previewZoom})`, width: `${100 / previewZoom}%` }}>
            <thead>
              <tr>
                <th className="spreadsheet-corner" />
                {Array.from({ length: visibleColumnCount }, (_, index) => (
                  <th key={index}>{columnLabel(index)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th>{rowIndex + 1}</th>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HTMLContainer>
  );
}

export class SpreadsheetShapeUtil extends BaseBoxShapeUtil<SpreadsheetShape> {
  static override type = SPREADSHEET_TYPE;
  static override props: RecordProps<SpreadsheetShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    workbook: T.string,
    previewZoom: T.optional(T.number),
  };

  getDefaultProps(): SpreadsheetShape["props"] {
    const title = "New spreadsheet";
    return { w: 820, h: 520, title, workbook: JSON.stringify(initialWorkbook(title)), previewZoom: 1 };
  }

  override canEdit() {
    return true;
  }
  override canResize() {
    return true;
  }
  component(shape: SpreadsheetShape) {
    return <SpreadsheetView shape={shape} />;
  }

  getIndicatorPath(shape: SpreadsheetShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12);
    return path;
  }
}

function workbookFromRows(title: string, rows: string[][]) {
  const workbook = initialWorkbook(title);
  const sheetId = workbook.sheetOrder[0];
  workbook.sheets[sheetId].rowCount = Math.max(100, rows.length + 20);
  workbook.sheets[sheetId].columnCount = Math.max(26, ...rows.map((row) => row.length));
  workbook.sheets[sheetId].cellData = Object.fromEntries(
    rows.map((row, rowIndex) => [rowIndex, Object.fromEntries(row.map((value, columnIndex) => [columnIndex, value.startsWith("=") ? { f: value } : { v: value }]))]),
  );
  return workbook;
}

export function addSpreadsheet(editor: Editor, options?: { title?: string; rows?: string[][] }) {
  const id = createShapeId(`spreadsheet-${Date.now().toString(36)}`);
  const center = editor.getViewportPageBounds().center;
  const title = options?.title ?? "New spreadsheet";
  const props = options?.rows ? { title, workbook: JSON.stringify(workbookFromRows(title, options.rows)) } : undefined;
  editor.createShape({ id, type: SPREADSHEET_TYPE, x: center.x - 410, y: center.y - 260, props });
  editor.select(id);
  editor.zoomToSelection({ animation: { duration: 240 } });
}
