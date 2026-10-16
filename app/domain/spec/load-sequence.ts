import { type Editor, type IndexKey, createShapeId, toRichText } from "tldraw";
import { type DiagramSpec } from "./types";
import { clearTransientCanvasOverlays } from "./helpers";

export function loadSequenceSpec(editor: Editor, spec: DiagramSpec) {
  const sequence = spec.sequence!;
  const suffix = Date.now().toString(36);
  const left = 120;
  const top = 180;
  const columnGap = 380;
  const messageGap = 100;
  const headerW = 250;
  const headerH = 90;
  const lifelineBottom = top + headerH + Math.max(1, sequence.messages.length) * messageGap + 80;
  const centers = new Map(sequence.participants.map((participant, index) => [participant.id, left + index * columnGap + headerW / 2]));

  editor.run(() => {
    if (spec.title) {
      editor.createShape({ id: createShapeId(`sequence-title-${suffix}`), type: "text", x: left, y: 30, props: { w: 1000, size: "xl", font: "sans", richText: toRichText(spec.title) } });
    }
    for (const [index, participant] of sequence.participants.entries()) {
      const x = left + index * columnGap;
      const displayLabel = participant.icon ? `${participant.icon}  ${participant.label}` : participant.label;
      editor.createShape({
        id: createShapeId(`participant-${participant.id}-${suffix}`),
        type: "geo",
        x,
        y: top,
        props: { w: headerW, h: headerH, geo: "rectangle", color: "blue", fill: "none", richText: toRichText(displayLabel) },
      });
      editor.createShape({
        id: createShapeId(`lifeline-${participant.id}-${suffix}`),
        type: "line",
        x: x + headerW / 2,
        y: top + headerH,
        props: {
          color: "light-blue",
          dash: "solid",
          size: "s",
          spline: "line",
          points: {
            start: { id: "start", index: "a1" as IndexKey, x: 0, y: 0 },
            end: { id: "end", index: "a2" as IndexKey, x: 0, y: lifelineBottom - top - headerH },
          },
        },
      });
      editor.createShape({
        id: createShapeId(`participant-footer-${participant.id}-${suffix}`),
        type: "geo",
        x,
        y: lifelineBottom,
        props: { w: headerW, h: headerH, geo: "rectangle", color: "blue", fill: "none", richText: toRichText(displayLabel) },
      });
    }
    for (const [index, message] of sequence.messages.entries()) {
      const fromX = centers.get(message.from);
      const toX = centers.get(message.to);
      if (fromX === undefined || toX === undefined) throw new Error(`Unknown sequence participant: ${message.from} -> ${message.to}`);
      if (fromX === toX) throw new Error(`Self messages are not supported yet: ${message.from}`);
      const y = top + headerH + 70 + index * messageGap;
      editor.createShape({
        id: createShapeId(`message-${index}-${suffix}`),
        type: "arrow",
        x: 0,
        y: 0,
        props: { start: { x: fromX, y }, end: { x: toX, y }, color: "black", dash: "solid", size: "m", labelPosition: 0.5, richText: toRichText(message.label) },
      });
    }
  });
  editor.zoomToFit({ animation: { duration: 350 } });
  clearTransientCanvasOverlays(editor);
}
