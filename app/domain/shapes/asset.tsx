import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps } from "tldraw";
import { catalogEntry } from "../asset-catalog";
import { AssetIcon } from "../icons";
import { ASSET_TYPE, type AssetShape } from "./types";

export class AssetShapeUtil extends BaseBoxShapeUtil<AssetShape> {
  static override type = ASSET_TYPE;
  static override props: RecordProps<AssetShape> = {
    w: T.number,
    h: T.number,
    kind: T.string,
    label: T.string,
  };

  getDefaultProps(): AssetShape["props"] {
    return { w: 150, h: 170, kind: "person", label: "Person" };
  }

  component(shape: AssetShape) {
    const asset = catalogEntry(shape.props.kind);
    return (
      <HTMLContainer className={`asset-shape asset-shape--${asset.tone}`}>
        <div className="asset-shape__icon">
          <AssetIcon kind={shape.props.kind} />
        </div>
        <strong>{shape.props.label}</strong>
        <span>{shape.props.kind}</span>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: AssetShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 22);
    return path;
  }
}
