import { BaseBoxShapeUtil, HTMLContainer, T, useEditor, useValue, type RecordProps } from "tldraw";
import { useEffect, useRef } from "react";
import { CLEAN_BOX_TYPE, type CleanBoxShape } from "./types";
import { editableTextBoxHeight } from "./text-height";

function EditableCleanBox({ shape }: { shape: CleanBoxShape }) {
  const editor = useEditor();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = useValue("editing clean box", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);
  useEffect(() => {
    if (!isEditing) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isEditing]);
  if (isEditing)
    return (
      <HTMLContainer className={`clean-box clean-box--${shape.props.color}`}>
        <textarea
          ref={inputRef}
          value={shape.props.label}
          onChange={(event) => {
            const label = event.target.value;
            editor.updateShape({ id: shape.id, type: CLEAN_BOX_TYPE, props: { label, h: editableTextBoxHeight(label, shape.props.w, 120) } });
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </HTMLContainer>
    );
  return (
    <HTMLContainer className={`clean-box clean-box--${shape.props.color}`}>
      <strong>{shape.props.label}</strong>
    </HTMLContainer>
  );
}

export class CleanBoxUtil extends BaseBoxShapeUtil<CleanBoxShape> {
  static override type = CLEAN_BOX_TYPE;
  static override props: RecordProps<CleanBoxShape> = {
    w: T.number,
    h: T.number,
    label: T.string,
    color: T.literalEnum("black", "blue", "green", "red", "violet", "orange"),
  };
  getDefaultProps(): CleanBoxShape["props"] {
    return { w: 240, h: 120, label: "Box", color: "blue" };
  }
  override canEdit() {
    return true;
  }
  component(shape: CleanBoxShape) {
    return <EditableCleanBox shape={shape} />;
  }
  getIndicatorPath(shape: CleanBoxShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
