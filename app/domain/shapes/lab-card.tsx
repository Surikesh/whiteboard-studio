import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps } from "tldraw";
import { CARD_TYPE, type LabCardShape } from "./types";

export class LabCardUtil extends BaseBoxShapeUtil<LabCardShape> {
  static override type = CARD_TYPE;
  static override props: RecordProps<LabCardShape> = {
    w: T.number,
    h: T.number,
    eyebrow: T.string,
    title: T.string,
    body: T.string,
    tone: T.literalEnum("violet", "mint", "amber"),
  };

  getDefaultProps(): LabCardShape["props"] {
    return {
      w: 300,
      h: 190,
      eyebrow: "CUSTOM SHAPE",
      title: "Custom card",
      body: "This is a React component inside the canvas, with its own data, look and behavior.",
      tone: "violet",
    };
  }

  component(shape: LabCardShape) {
    return (
      <HTMLContainer className={`lab-card lab-card--${shape.props.tone}`}>
        <span>{shape.props.eyebrow}</span>
        <strong>{shape.props.title}</strong>
        <p>{shape.props.body}</p>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: LabCardShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 18);
    return path;
  }
}
