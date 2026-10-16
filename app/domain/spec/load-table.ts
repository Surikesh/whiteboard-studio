import { type Editor, createShapeId, toRichText } from "tldraw";
import { type DiagramSpec } from "./types";
import { clearTransientCanvasOverlays } from "./helpers";

export function loadTableSpec(editor: Editor, spec: DiagramSpec) {
  const table = spec.table!;
  const suffix = Date.now().toString(36);
  const left = 100;
  const top = 170;
  const labelWidth = 300;
  const valueWidth = 310;
  const headerHeight = 100;
  const rowHeight = 92;
  const columns = ["Criterion", ...table.columns];
  const rows = [columns, ...table.rows.map((row) => [row.label, ...row.values])];
  editor.run(() => {
    if (spec.title) editor.createShape({ id: createShapeId(`table-title-${suffix}`), type: "text", x: left, y: 30, props: { w: 1200, size: "xl", font: "sans", richText: toRichText(spec.title) } });
    for (const [rowIndex, row] of rows.entries()) {
      for (const [columnIndex, label] of row.entries()) {
        const x = left + (columnIndex === 0 ? 0 : labelWidth + (columnIndex - 1) * valueWidth);
        const w = columnIndex === 0 ? labelWidth : valueWidth;
        const y = top + (rowIndex === 0 ? 0 : headerHeight + (rowIndex - 1) * rowHeight);
        const h = rowIndex === 0 ? headerHeight : rowHeight;
        editor.createShape({
          id: createShapeId(`table-${rowIndex}-${columnIndex}-${suffix}`),
          type: "geo",
          x,
          y,
          props: {
            w,
            h,
            geo: "rectangle",
            color: rowIndex === 0 || columnIndex === 0 ? "grey" : "black",
            fill: rowIndex === 0 || columnIndex === 0 ? "solid" : "none",
            richText: toRichText(label ?? ""),
          },
        });
      }
    }
  });
  editor.zoomToFit({ animation: { duration: 350 } });
  clearTransientCanvasOverlays(editor);
}
