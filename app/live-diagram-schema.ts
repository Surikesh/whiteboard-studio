import { createShapePropsMigrationIds, createShapePropsMigrationSequence, richTextValidator } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";

// Shared by the client and the sync room. No changes to built-in record schemas.
export const liveFrameProps = {
  w: T.number,
  h: T.number,
  richText: richTextValidator,
  frame: T.literalEnum("plain", "mat", "bevel"),
};

// SDK sources (read from the installed node_modules):
// - id format `com.tldraw.shape.<type>/<n>`: @tldraw/tlschema/src/records/TLShape.ts:538-545
// - `up(props)` runs on record.props in place; a returned value replaces props, undefined keeps the mutation:
//   @tldraw/tlschema/src/recordsWithProps.ts:250-265
// - a persisted schema without this sequence is migrated from the start: @tldraw/store/src/lib/StoreSchema.ts:459-468
// - client Store.migrateSnapshot (Store.ts:847) and the sync room (sync-core TLSyncRoom.ts:286, migrateStorage) use the same schema.
const versions = createShapePropsMigrationIds("live-frame", { RemoveBevel: 1, RestoreBevel: 2 });

// The chain is append-only: a store already at a version never re-runs its earlier steps.
export const liveFrameMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      // Boards saved before this step (with an early 'bevel' frame) open as 'mat'.
      id: versions.RemoveBevel,
      up(props: { frame: string }) {
        if (props.frame === "bevel") props.frame = "mat";
      },
    },
    {
      // 'bevel' is a real style again. Up is a no-op; down keeps a client on version 1 valid
      // (the sync room migrates records down for older clients).
      id: versions.RestoreBevel,
      up() {},
      down(props: { frame: string }) {
        if (props.frame === "bevel") props.frame = "mat";
      },
    },
  ],
});
