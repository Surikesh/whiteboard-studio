# Sequence diagram layout guide

Use this contract for `diagramType: "sequence"` specs.

## Reading model

- Time always moves **top to bottom**.
- Participants are columns ordered left to right by first appearance in the interaction.
- Requests point toward the callee; responses point back to the caller. Render all message arrows as solid lines.
- Do not reorder participants midway through a diagram.

## Geometry

- Participant headers share one exact `y` coordinate.
- Render the same participant box at both the top and bottom of every participant column. This is mandatory, not optional.
- Render one thin solid light-blue lifeline per participant. It must be a normal editable shape, never locked, and must stop exactly at the top edge of the bottom participant box. Do not use dotted or dashed background guides.
- Top and bottom participant boxes share the same `x`, width, style, icon, and label.
- Add one restrained semantic icon when the participant has an obvious visual identity (for example `🌐` browser, `👤` person, `🗄️` database, `✅` validator, `🧩` application). Use the same icon at both ends and never use more than one icon per participant.
- Standard participant column pitch is 380 px; participant box width is 250 px so an icon and label stay on one line.
- Messages use one horizontal rank each, with a compact 100 px vertical pitch. Increase only when labels visibly collide.
- Every message starts and ends at the center of its participant lifeline.
- Message arrows must be horizontal. Never use diagonal sequence messages.
- Keep 70 px between the top participant boxes and the first message, and 80 px between the final message rank and the bottom participant boxes.
- Optimize for compact height: do not add empty ranks or decorative vertical padding.

## Labels

- Put each label centered above/on its message arrow.
- Keep labels on one line and at most 32 characters; prefer 2–5 concise words.
- Use verbs (`Create snapshot`, `Load spec`) rather than prose.
- If a label needs wrapping, shorten it or widen participant spacing—never wrap it.

## Complexity

- Prefer 3–6 participants and 4–10 messages in one diagram.
- Split alternative scenarios into separate diagrams until `alt`/`opt` frames are supported.
- Self-messages are currently unsupported; represent internal work as a note or omit it.
- Use a separate sequence diagram per successful flow, failure flow, or retry flow.

## Preflight

1. Time reads top to bottom without exceptions.
2. All top boxes align, all bottom boxes align, and every participant icon and label appears identically at both ends.
3. Lifelines are thin, solid, editable, aligned to participant centers, and terminate at the bottom boxes; no dotted guides or locked decorative lines are present.
4. Every message is horizontal and occupies a unique rank.
5. Requests and responses are solid.
6. Labels are single-line, concise, and do not collide with lifelines.
7. The participant order minimizes long return arrows and crossings.
