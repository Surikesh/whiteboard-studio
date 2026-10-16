import { type Editor, type IndexKey, createShapeId, toRichText } from "tldraw";
import { resolveAssetKind } from "../asset-kinds";
import { ASSET_TYPE, SERVICE_TYPE } from "../shapes/types";
import { type DiagramSpec, getSpecNodeSize } from "./types";
import { clearTransientCanvasOverlays } from "./helpers";
import { bindSpecArrow } from "./arrow-binding";
import { loadSequenceSpec } from "./load-sequence";
import { loadTableSpec } from "./load-table";

export function loadDiagramSpec(editor: Editor, spec: DiagramSpec) {
  if (spec.diagramType === "sequence") {
    loadSequenceSpec(editor, spec);
    return;
  }
  if (spec.diagramType === "comparison" && spec.table) {
    loadTableSpec(editor, spec);
    return;
  }
  const suffix = Date.now().toString(36);
  const ids = new Map(spec.nodes.map((node) => [node.id, createShapeId(`spec-${node.id}-${suffix}`)]));

  editor.run(() => {
    if (spec.title) {
      editor.createShape({
        id: createShapeId(`spec-title-${suffix}`),
        type: "text",
        x: 40,
        y: 20,
        props: { w: 900, size: "xl", font: "sans", richText: toRichText(spec.title) },
      });
    }
    for (const node of spec.nodes) {
      const id = ids.get(node.id)!;
      if (node.kind === "divider") {
        editor.createShape({
          id,
          type: "line",
          x: node.x,
          y: node.y,
          props: {
            color: "grey",
            dash: "solid",
            size: "s",
            spline: "line",
            points: {
              start: { id: "start", index: "a1" as IndexKey, x: 0, y: 0 },
              end: { id: "end", index: "a2" as IndexKey, x: 0, y: node.h ?? 1000 },
            },
          },
        });
      } else if (node.kind === "service") {
        editor.createShape({
          id,
          type: SERVICE_TYPE,
          x: node.x,
          y: node.y,
          props: { w: node.w ?? 260, h: node.h ?? 150, name: node.label, technology: node.technology ?? "", owner: node.owner ?? "", status: node.status ?? "healthy" },
        });
      } else if (node.kind === "asset") {
        const assetKind = node.assetKind ? resolveAssetKind(node.assetKind) : "server";
        editor.createShape({ id, type: ASSET_TYPE, x: node.x, y: node.y, props: { w: node.w ?? 180, h: node.h ?? 190, kind: assetKind, label: node.label } });
      } else if (node.kind === "text") {
        editor.createShape({ id, type: "text", x: node.x, y: node.y, props: { w: node.w ?? 300, autoSize: false, size: "m", font: "sans", richText: toRichText(node.label) } });
      } else {
        // Generated text belongs in Tldraw's native editable shapes. Decorative
        // styling must never turn diagram copy into an uneditable picture.
        const size = getSpecNodeSize(node);
        const semanticColor = node.kind === "claim" ? "violet" : node.kind === "evidence" ? "blue" : node.kind === "outcome" ? "green" : (node.color ?? "blue");
        editor.createShape({
          id,
          type: "geo",
          x: node.x,
          y: node.y,
          meta: { diagramSpecMinimumHeight: size.h },
          props: {
            w: size.w,
            h: size.h,
            geo: node.kind === "decision" ? "diamond" : "rectangle",
            color: semanticColor,
            fill: node.kind === "note" ? "solid" : "none",
            richText: toRichText(node.label),
          },
        });
      }
    }
    for (const [index, edge] of (spec.edges ?? []).entries()) {
      const fromId = ids.get(edge.from);
      const toId = ids.get(edge.to);
      if (!fromId || !toId) throw new Error(`Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
      const from = spec.nodes.find((node) => node.id === edge.from)!;
      const to = spec.nodes.find((node) => node.id === edge.to)!;
      const arrowId = createShapeId(`spec-arrow-${index}-${suffix}`);
      const fromSize = getSpecNodeSize(from);
      const toSize = getSpecNodeSize(to);
      const fromCenter = { x: from.x + fromSize.w / 2, y: from.y + fromSize.h / 2 };
      const toCenter = { x: to.x + toSize.w / 2, y: to.y + toSize.h / 2 };
      editor.createShape({
        id: arrowId,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          start: fromCenter,
          end: toCenter,
          color:
            edge.relation === "opposes" || edge.relation === "negative" || edge.relation === "no"
              ? "red"
              : edge.relation === "supports" || edge.relation === "positive" || edge.relation === "yes"
                ? "green"
                : (edge.color ?? "black"),
          richText: toRichText(edge.label ?? edge.relation ?? ""),
        },
      });
      bindSpecArrow(editor, arrowId, fromId, toId, from, to);
    }
  });
  editor.zoomToFit({ animation: { duration: 350 } });
  clearTransientCanvasOverlays(editor);
}
