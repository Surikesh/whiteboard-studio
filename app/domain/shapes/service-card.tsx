import { BaseBoxShapeUtil, HTMLContainer, T, useEditor, useValue, type RecordProps } from "tldraw";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { SERVICE_TYPE, type ServiceShape } from "./types";
import { editableTextBoxHeight } from "./text-height";

export function serviceCardHeight(name: string, width: number) {
  return editableTextBoxHeight(name, width, 220);
}

function EditableServiceCard({ shape }: { shape: ServiceShape }) {
  const editor = useEditor();
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = useValue("editing service card", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);
  useEffect(() => {
    if (!isEditing) return;
    const timer = window.setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isEditing]);
  const update = (props: Partial<ServiceShape["props"]>) => {
    const name = props.name ?? shape.props.name;
    editor.updateShape({ id: shape.id, type: SERVICE_TYPE, props: { ...props, h: serviceCardHeight(name, shape.props.w) } });
  };
  const keepFieldFocus = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (field.matches("input, textarea")) window.setTimeout(() => field.focus(), 0);
  };
  return (
    <HTMLContainer className={`service-card service-card--${shape.props.status}${isEditing ? " is-editing" : ""}`} onPointerDown={isEditing ? keepFieldFocus : undefined}>
      <div className="service-card__topline">
        <span className="service-card__type">CARD</span>
        <span className="service-card__status">{shape.props.status}</span>
      </div>
      {isEditing ? (
        <div className="service-card__editor" onPointerDown={keepFieldFocus} onClick={(event) => event.stopPropagation()}>
          <label>
            Main text
            <textarea ref={nameRef} aria-label="Card main text" value={shape.props.name} onChange={(event) => update({ name: event.target.value })} />
          </label>
          <label>
            Details
            <input aria-label="Card details" value={shape.props.technology} onChange={(event) => update({ technology: event.target.value })} />
          </label>
          <label>
            Caption
            <input aria-label="Card caption" value={shape.props.owner} onChange={(event) => update({ owner: event.target.value })} />
          </label>
        </div>
      ) : (
        <div className="service-card__content">
          <strong>{shape.props.name}</strong>
          <div className="service-card__details">{shape.props.technology || "Add details"}</div>
          <div className="service-card__owner">{shape.props.owner || "Add caption"}</div>
        </div>
      )}
    </HTMLContainer>
  );
}

export class ServiceShapeUtil extends BaseBoxShapeUtil<ServiceShape> {
  static override type = SERVICE_TYPE;
  static override props: RecordProps<ServiceShape> = {
    w: T.number,
    h: T.number,
    name: T.string,
    technology: T.string,
    owner: T.string,
    status: T.literalEnum("healthy", "warning", "critical"),
  };

  getDefaultProps(): ServiceShape["props"] {
    return {
      w: 260,
      h: 150,
      name: "New service",
      technology: "Technology",
      owner: "No team assigned",
      status: "healthy",
    };
  }

  override canEdit() {
    return true;
  }
  component(shape: ServiceShape) {
    return <EditableServiceCard shape={shape} />;
  }

  getIndicatorPath(shape: ServiceShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 14);
    return path;
  }
}
