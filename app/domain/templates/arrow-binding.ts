import { type Editor, type createShapeId } from "tldraw";

export function bindArrow(editor: Editor, arrowId: ReturnType<typeof createShapeId>, fromId: ReturnType<typeof createShapeId>, toId: ReturnType<typeof createShapeId>) {
  editor.createBinding({
    type: "arrow",
    fromId: arrowId,
    toId: fromId,
    props: {
      terminal: "start",
      normalizedAnchor: { x: 1, y: 0.5 },
      isExact: false,
      isPrecise: true,
      snap: "edge",
    },
  });
  editor.createBinding({
    type: "arrow",
    fromId: arrowId,
    toId,
    props: {
      terminal: "end",
      normalizedAnchor: { x: 0, y: 0.5 },
      isExact: false,
      isPrecise: true,
      snap: "edge",
    },
  });
}
