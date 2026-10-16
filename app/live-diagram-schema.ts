import { createShapePropsMigrationIds, createShapePropsMigrationSequence, richTextValidator } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";

// Shared by the client and the sync room. No changes to built-in record schemas.
export const liveFrameProps = {
  w: T.number,
  h: T.number,
  richText: richTextValidator,
  frame: T.literalEnum("plain", "mat"),
};

// SDK sources (read from the installed node_modules):
// - id format `com.tldraw.shape.<type>/<n>`: @tldraw/tlschema/src/records/TLShape.ts:538-545
// - `up(props)` runs on record.props in place; a returned value replaces props, undefined keeps the mutation:
//   @tldraw/tlschema/src/recordsWithProps.ts:250-265
// - a persisted schema without this sequence is migrated from the start: @tldraw/store/src/lib/StoreSchema.ts:459-468
// - client Store.migrateSnapshot (Store.ts:847) and the sync room (sync-core TLSyncRoom.ts:286, migrateStorage) use the same schema.
const versions = createShapePropsMigrationIds("live-frame", { RemoveBevel: 1 });

// Boards saved with the removed 'bevel' frame style open as 'mat'.
export const liveFrameMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: versions.RemoveBevel,
      up(props: { frame: string }) {
        if (props.frame === "bevel") props.frame = "mat";
      },
    },
  ],
});
