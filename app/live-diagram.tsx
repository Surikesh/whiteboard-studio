"use client";

import { createContext, forwardRef, useContext, useEffect, useState } from "react";
import {
  BaseBoxShapeUtil,
  Box,
  DefaultShapeWrapper,
  HTMLContainer,
  Rectangle2d,
  RichTextLabel,
  RichTextSVG,
  SVGContainer,
  createShapeId,
  getArrowInfo,
  renderHtmlFromRichText,
  renderPlaintextFromRichText,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type TLShape,
  type TLShapeWrapperProps,
  type TLRichText,
} from "tldraw";
import { liveFrameMigrations, liveFrameProps } from "./live-diagram-schema";
import "./live-diagram.css";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "live-frame": { w: number; h: number; richText: TLRichText; frame: "plain" | "mat" };
  }
}
type FrameShape = TLShape<"live-frame">;
const textStyle = { fontFamily: "Arial", fontSize: 20, lineHeight: 1.35, padding: 24 };

/** Fixed page-space insets, not a stretched bitmap. Shared canvas/export geometry. */
function FrameBody({ shape }: { shape: FrameShape }) {
  const { w, h, frame } = shape.props;
  return (
    <g data-live-frame={frame}>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={2} fill="#fffefa" stroke="#68665f" strokeWidth={1.5} />
      {frame === "mat" && (
        <>
          <rect x={7} y={7} width={w - 14} height={h - 14} rx={1} fill="none" stroke="#d0cbc0" strokeWidth={7} />
          <rect x={13} y={13} width={w - 26} height={h - 26} fill="none" stroke="#8e887c" strokeWidth={1} />
        </>
      )}
    </g>
  );
}

function FrameLabel({ shape }: { shape: FrameShape }) {
  const editor = useEditor();
  const selected = useValue("frame selected", () => editor.getOnlySelectedShapeId() === shape.id, [editor, shape.id]);
  return (
    <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
      <RichTextLabel
        shapeId={shape.id}
        type={shape.type}
        richText={shape.props.richText}
        {...textStyle}
        textAlign="center"
        verticalAlign="middle"
        labelColor="#302f2b"
        isSelected={selected}
        wrap
        showTextOutline={false}
      />
    </HTMLContainer>
  );
}

export class LiveFrameUtil extends BaseBoxShapeUtil<FrameShape> {
  static override type = "live-frame" as const;
  static override props = liveFrameProps;
  static override migrations = liveFrameMigrations;
  override getDefaultProps(): FrameShape["props"] {
    return { w: 220, h: 120, richText: toRichText("Block"), frame: "plain" };
  }
  override canEdit() {
    return true;
  }
  override getText(shape: FrameShape) {
    return renderPlaintextFromRichText(this.editor, shape.props.richText);
  }
  override getGeometry(shape: FrameShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  override getIndicatorPath(shape: FrameShape) {
    const p = new Path2D();
    p.rect(0, 0, shape.props.w, shape.props.h);
    return p;
  }
  // Standard box resize changes dimensions, never font size. Grow only as needed
  // so typing and narrow resizes cannot put editable text underneath the frame.
  private fit(shape: FrameShape): FrameShape {
    const w = Math.max(100, shape.props.w);
    const measured = this.editor.textMeasure.measureHtml(renderHtmlFromRichText(this.editor, shape.props.richText), {
      ...textStyle,
      padding: "0px",
      fontStyle: "normal",
      fontWeight: "normal",
      maxWidth: w - 48,
    });
    return { ...shape, props: { ...shape.props, w, h: Math.max(80, shape.props.h, Math.ceil(measured.h) + 48) } };
  }
  override onBeforeCreate(shape: FrameShape) {
    return this.fit(shape);
  }
  override onBeforeUpdate(_prev: FrameShape, next: FrameShape) {
    return this.fit(next);
  }
  override component(shape: FrameShape) {
    return (
      <>
        <SVGContainer>
          <FrameBody shape={shape} />
        </SVGContainer>
        <FrameLabel shape={shape} />
      </>
    );
  }
  override toSvg(shape: FrameShape) {
    return (
      <>
        <FrameBody shape={shape} />
        <RichTextSVG
          bounds={new Box(0, 0, shape.props.w, shape.props.h)}
          richText={shape.props.richText}
          {...textStyle}
          textAlign="center"
          verticalAlign="middle"
          labelColor="#302f2b"
          showTextOutline={false}
        />
      </>
    );
  }
}

export const LivePlaybackContext = createContext(false);

// Public wrapper extension: preserves tldraw's ref, transforms, clipping, order
// and event handling. Motion never updates records or undo history.
export const LiveShapeWrapper = forwardRef<HTMLDivElement, TLShapeWrapperProps>(function LiveShapeWrapper(props, ref) {
  const editor = useEditor();
  const playing = useContext(LivePlaybackContext);
  const { shape, isBackground } = props;
  const path = useValue(
    "live arrow path",
    () => {
      if (isBackground || shape.type !== "arrow" || shape.meta.liveFlow !== true) return null;
      const info = getArrowInfo(editor, shape);
      if (!info?.isValid) return null;
      // Deliberately only unambiguous, single-headed straight/curved arrows.
      // Elbow corner rounding is not exposed as a public body-path API in 5.2.5.
      if (info.type === "elbow") return null;
      const reverse = info.end.arrowhead === "none" && info.start.arrowhead !== "none";
      if ((info.end.arrowhead === "none") === (info.start.arrowhead === "none")) return null;
      const a = info.start.point,
        b = info.end.point;
      const d =
        info.type === "straight"
          ? `M${a.x},${a.y} L${b.x},${b.y}`
          : `M${a.x},${a.y} A${info.bodyArc.radius},${info.bodyArc.radius} 0 ${info.bodyArc.largeArcFlag} ${info.bodyArc.sweepFlag} ${b.x},${b.y}`;
      return { d, reverse };
    },
    [editor, shape, isBackground],
  );
  const bounds = useValue("live activity bounds", () => (!isBackground && shape.type !== "arrow" && shape.meta.liveActive === true ? editor.getShapeGeometry(shape).bounds : null), [
    editor,
    shape,
    isBackground,
  ]);
  return (
    <DefaultShapeWrapper {...props} ref={ref}>
      {props.children}
      {!isBackground && (bounds || (path && playing)) && (
        <svg className="live-decoration" aria-hidden="true" width="100%" height="100%">
          {path && playing && (
            <circle r={4} fill="#287b78" stroke="#fffefa" strokeWidth={1.5} data-live-pulse="true">
              <animateMotion key={path.d + path.reverse} path={path.d} dur="2.8s" repeatCount="indefinite" keyPoints={path.reverse ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
            </circle>
          )}
          {bounds && (
            <rect
              className={playing ? "live-active is-playing" : "live-active"}
              x={bounds.x + 3}
              y={bounds.y + 3}
              width={Math.max(0, bounds.w - 6)}
              height={Math.max(0, bounds.h - 6)}
              rx={2}
              fill="none"
              stroke="#287b78"
              strokeWidth={2}
            />
          )}
        </svg>
      )}
    </DefaultShapeWrapper>
  );
});

export function useLivePlayback() {
  const [requested, setRequested] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setRequested(false);
    };
    const visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return { playing: requested && !reduced && visible, requested, setRequested, reduced };
}

export function LiveControls({ editor, playback }: { editor: Editor; playback: ReturnType<typeof useLivePlayback> }) {
  const selected = useValue("live selection", () => editor.getSelectedShapes(), [editor]);
  const readonly = useValue("live readonly", () => editor.getIsReadonly(), [editor]);
  const frame = selected.length === 1 && selected[0].type === "live-frame" ? selected[0] : null;
  const targets = selected.filter((s) => s.type !== "arrow");
  const arrows = selected.filter((s) => s.type === "arrow");
  const toggleMeta = (key: "liveActive" | "liveFlow", shapes: TLShape[]) => {
    editor.markHistoryStoppingPoint("live setting");
    const enable = !shapes.every((s) => s.meta[key] === true);
    editor.updateShapes(shapes.map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, [key]: enable } })));
  };
  return (
    <div className="live-controls" aria-label="Live diagram">
      <button
        aria-pressed={playback.requested}
        disabled={playback.reduced}
        title={playback.reduced ? "Motion is disabled by the system reduced-motion setting" : "Pulses on marked connections"}
        onClick={() => playback.setRequested(!playback.requested)}
      >
        {playback.reduced ? "No motion" : playback.requested ? "Pause" : "Live diagram · Play"}
      </button>
      <details>
        <summary>Styling</summary>
        <div className="live-options">
          <button
            disabled={readonly}
            onClick={() => {
              const p = editor.getViewportPageBounds().center;
              const id = createShapeId();
              editor.markHistoryStoppingPoint("add live frame");
              editor.createShape({ id, type: "live-frame", x: p.x - 110, y: p.y - 60 });
              editor.select(id);
            }}
          >
            Add framed block
          </button>
          <label>
            Frame
            <select
              aria-label="Frame"
              disabled={!frame || readonly}
              value={frame?.props.frame ?? "plain"}
              onChange={(e) => {
                if (!frame) return;
                editor.markHistoryStoppingPoint("frame style");
                editor.updateShape<FrameShape>({ id: frame.id, type: frame.type, props: { frame: e.target.value as FrameShape["props"]["frame"] } });
              }}
            >
              <option value="plain">Plain</option>
              <option value="mat">Mat</option>
            </select>
          </label>
          {!frame && <small>Select an experimental block. Regular shapes are not changed.</small>}
          <button disabled={!targets.length || readonly} aria-pressed={targets.length > 0 && targets.every((s) => s.meta.liveActive === true)} onClick={() => toggleMeta("liveActive", targets)}>
            Block highlight
          </button>
          <button disabled={!arrows.length || readonly} aria-pressed={arrows.length > 0 && arrows.every((s) => s.meta.liveFlow === true)} onClick={() => toggleMeta("liveFlow", arrows)}>
            Flow along selected arrows
          </button>
          <small>Straight and arc arrows with a single arrowhead. Double-click a block to edit its text.</small>
        </div>
      </details>
    </div>
  );
}

export { LIVE_DEMO_ID } from "./io/workspace-storage";
export function seedLiveDemo(editor: Editor) {
  if (editor.getCurrentPageShapes().length || editor.getCurrentPage().meta.liveDemoSeeded) return;
  const ids = ["user", "agent", "service", "response"].map((s) => createShapeId(`live-demo-${s}`));
  editor.run(() => {
    editor.updatePage({ id: editor.getCurrentPageId(), name: "Live diagram · User → Agent → Service → Response", meta: { liveDemoSeeded: true } });
    const blocks = [
      { x: 0, y: 50, w: 180, h: 120, frame: "plain" as const, text: "User" },
      { x: 270, y: 30, w: 240, h: 160, frame: "mat" as const, text: "Agent\nUnderstands the request\nChooses an action" },
      { x: 600, y: 0, w: 160, h: 220, frame: "mat" as const, text: "Service\nAPI\nProcessing" },
      { x: 850, y: 50, w: 300, h: 120, frame: "mat" as const, text: "Response\nData ready" },
    ];
    blocks.forEach((b, i) =>
      editor.createShape<FrameShape>({
        id: ids[i],
        type: "live-frame",
        x: b.x,
        y: b.y,
        props: { w: b.w, h: b.h, frame: b.frame, richText: toRichText(b.text) },
        meta: i === 1 ? { liveActive: true } : {},
      }),
    );
    for (let i = 0; i < 3; i++) {
      const id = createShapeId(`live-demo-flow-${i}`);
      editor.createShape({
        id,
        type: "arrow",
        x: 0,
        y: 0,
        props: { dash: "solid", color: "grey", size: "s", start: { x: blocks[i].x + blocks[i].w, y: 110 }, end: { x: blocks[i + 1].x, y: 110 } },
        meta: { liveFlow: true },
      });
      editor.createBindings([
        { type: "arrow", fromId: id, toId: ids[i], props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: true } },
        { type: "arrow", fromId: id, toId: ids[i + 1], props: { terminal: "end", normalizedAnchor: { x: 0, y: 0.5 }, isExact: false, isPrecise: true } },
      ]);
    }
  });
  editor.zoomToFit();
}
