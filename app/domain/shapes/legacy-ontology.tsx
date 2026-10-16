import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps } from "tldraw";
import { LEGACY_ONTOLOGY_TYPE, type LegacyOntologyShape } from "./types";

// Legacy: boards saved before the ontology template was removed still hold these records.
// Kept only so they validate and load unchanged (ids and arrow bindings preserved); never offered in any menu.
export class LegacyOntologyUtil extends BaseBoxShapeUtil<LegacyOntologyShape> {
  static override type = LEGACY_ONTOLOGY_TYPE;
  static override props: RecordProps<LegacyOntologyShape> = {
    w: T.number,
    h: T.number,
    kind: T.string,
    label: T.string,
    properties: T.string,
  };

  getDefaultProps(): LegacyOntologyShape["props"] {
    return { w: 220, h: 250, kind: "", label: "", properties: "" };
  }

  component(shape: LegacyOntologyShape) {
    return (
      <HTMLContainer className="legacy-node">
        <strong>{shape.props.label}</strong>
        <em>{shape.props.properties}</em>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: LegacyOntologyShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 14);
    return path;
  }
}
