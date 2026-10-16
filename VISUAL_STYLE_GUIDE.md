# Default visual style for agent-authored diagrams

The reference style is the bundled demo workspace `td_demo_web_architecture` (editable technology icons). Treat its visual language as the default for new diagrams unless the user explicitly requests another style.

## Default language

- Represent concrete systems, actors, technologies, actions, stores, and warnings as compact icon-led `asset` nodes, not status cards.
- Use a short editable label below the icon. Keep the icon dominant and the label secondary.
- Prefer simple pencil-like pictograms for concepts and recognizable local technology logos for products.
- Use ordinary unfilled `box` nodes only for boundaries or grouped runtime areas, `decision` only for real branches, `text` for headings, and `note` only for necessary annotations.
- Never use `service` / `service-card` merely because a node is software or infrastructure. Health/status cards are not the default diagram vocabulary and must appear only when the question is specifically about operational health and the status itself carries information.
- Do not decorate every node with owner, technology, status, badges, or card chrome. Encode only information needed to answer the focus question.

## Asset nodes

Use this shape in a `tldraw-lab/v1` spec:

```json
{
  "id": "registry",
  "label": "Artifactory",
  "x": 900,
  "y": 1200,
  "w": 180,
  "h": 190,
  "kind": "asset",
  "assetKind": "database"
}
```

Current reusable `assetKind` values:

- General: `person`, `database`, `server`, `web-host` (browser window with web code), `cloud`, `api`, `queue`, `brain`, `switch` (router).
- Process and organization: `form`, `choice`, `workflow`, `metrics`, `approval`, `plan`.
- Architecture and deployment: `environment` (stacked deployment layers marked with a stage flag), `warning`.
- Source control: `git-rebase` (a commit branch replayed onto another base).
- Technologies: `docker`, `kubernetes`, `nginx`, `redis`, `elastic`, `linux`, `windows`.

An unknown or removed `assetKind` in a spec or a stored board renders as a neutral box with the stored label; it never fails to load.

## Semantic icon gate

Choose an icon by the entity's meaning, never by superficial visual similarity or by whichever icon is already available. Before writing the spec, state the intended noun/action for every concrete node and verify that the selected pictogram communicates that meaning without its label. In particular, do not use:

- `switch` for teams or orchestration merely because it contains connected boxes;
- `approval` for ordinary work or a generic successful result;
- `brain` for every agent-related concept when the node actually means configuration or coordination.

If a reasonable viewer would infer the wrong concept from the pictogram alone, the icon fails and must be replaced or created.

## Missing icon policy

When the required icon is absent:

1. Reuse an existing local pictogram only when it is semantically exact and remains unambiguous without the label. "Closest available" is not sufficient.
2. Otherwise create or generate a new reusable `assetKind` and matching icon in the central component library before authoring the diagram. Do not finish the diagram with a knowingly approximate placeholder.
3. For a named product or brand, use the real vendor logo or a faithful license-compatible brand asset—never invent, approximate, or stylize a replacement logo. Download it into `public/icons/tech/`; never hotlink a remote image and record source/license in `public/icons/tech/SOURCES.md`. If no legitimate brand asset can be sourced, stop and report that exact icon gap instead of drawing a fake logo.
4. When the user supplies a pictogram reference and asks for that icon, preserve its recognizable composition and detail level; do not replace it with a simplified metaphor. Remove backgrounds/captions only when requested or required for clean canvas use.
5. Only for a generic, non-branded concept with no supplied reference, create or generate an original transparent pictogram in the same visual family, with no text, background, card, shadow, or brand imitation, then store it locally and make it reusable.

Icons must remain legible at approximately 64–96 px, use transparent backgrounds, and must not carry essential text. Labels remain editable Tldraw text.

## Composition and restrained emphasis

- Use one dominant flow by default; the selected grammar may require another readable organization.
- Use zero to two focal elements by default. Emphasis must answer “where should the reader look first?”
- Color may encode focus or semantics, but keep that role consistent within a view.
- Do not decorate every node with badges or metadata.
- Avoid redundantly encoding the same fact with shape, icon, label, and position unless accessibility requires it.
- Keep asset nodes around 180 × 190; small technology assets inside a boundary may use 100 × 150.
- Group a runtime stack with one unfilled boundary, one editable heading, and individual icons, as in the reference document.
- Keep warnings as one icon-led annotation rather than a health card.
- Preserve the adaptive budgets, routing, and spacing requirements in `DIAGRAM_ROUTER.md` and `LAYOUT_GUIDE.md`.

These are semantic emphasis defaults, not a fixed skin. There is no blanket ban on shadows, particular fonts, or dark palettes, but no network-dependent font or asset may be required. The icon-led system and semantic icon gate remain authoritative.

## Preflight

Before completion verify that:

1. Every concrete node passes the semantic icon gate: the pictogram alone suggests the intended noun/action, and no merely approximate placeholder remains.
2. No generic health/status card appears unless health is the subject.
3. Every icon has a concise editable label.
4. Missing icons were added to the reusable library rather than embedded as one-off remote assets.
5. Technology logos are local and source/license metadata exists.
6. Repeated rows inside a boundary are mechanically aligned to identical left/right edges and stacked with the stroke-aware clearance required by `LAYOUT_GUIDE.md`; no borders touch or form accidental double rectangles.
7. The result still answers the focus question without decorative noise.
