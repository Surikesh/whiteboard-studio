import { type Editor, type createShapeId } from "tldraw";
import { getSpecNodeSize, type DiagramSpec } from "./types";

export function bindSpecArrow(
  editor: Editor,
  arrowId: ReturnType<typeof createShapeId>,
  fromId: ReturnType<typeof createShapeId>,
  toId: ReturnType<typeof createShapeId>,
  from: DiagramSpec["nodes"][number],
  to: DiagramSpec["nodes"][number],
) {
  const fromSize = getSpecNodeSize(from);
  const toSize = getSpecNodeSize(to);
  const fromCenter = { x: from.x + fromSize.w / 2, y: from.y + fromSize.h / 2 };
  const toCenter = { x: to.x + toSize.w / 2, y: to.y + toSize.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  // In top-down diagrams, even diagonal fan-out/fan-in edges must leave the
  // bottom center and enter the top center. Switch to side anchors only for
  // edges that are clearly horizontal.
  const horizontal = Math.abs(dy) < Math.abs(dx) * 0.5;
  const startAnchor = horizontal ? { x: dx >= 0 ? 1 : 0, y: 0.5 } : { x: 0.5, y: dy >= 0 ? 1 : 0 };
  const endAnchor = horizontal ? { x: dx >= 0 ? 0 : 1, y: 0.5 } : { x: 0.5, y: dy >= 0 ? 0 : 1 };
  for (const [terminal, shapeId, normalizedAnchor] of [
    ["start", fromId, startAnchor],
    ["end", toId, endAnchor],
  ] as const) {
    editor.createBinding({
      type: "arrow",
      fromId: arrowId,
      toId: shapeId,
      props: { terminal, normalizedAnchor, isExact: false, isPrecise: true, snap: "edge" },
    });
  }
}
