# Mermaid to Excalidraw handoff

## Scope

Start with existing Mermaid flowchart code. The user edits code alongside a preview, then explicitly creates an editable Excalidraw draft. Natural-language generation is a later stage.

## Acceptance criteria

- Valid flowcharts preview and convert into separate shapes, labels, and connected arrows.
- Individual nodes can be moved and recolored without breaking connector bindings.
- Source and edited canvas survive reopening.
- Invalid, empty, pending, or outdated conversion results cannot be inserted.
- Unsupported features are identified before insertion; image fallback is never presented as individually editable output.
- Regeneration creates a separate draft and preserves previous manual edits.
- Mermaid subgraph nodes remain independently selectable; the subgraph boundary may remain as a separate editable shape.

## Verified on the hosted editor, September 12, 2026

The existing More tools > Mermaid to Excalidraw feature already provides code input, preview, and Insert.

Tested a four-node flowchart with a decision, labeled branches, and a return edge. Insertion produced selectable shapes. Moved the Review structure node to the right and changed its background to blue. Its arrows followed the move. Reloading retained the changed layout and color. Reopening Mermaid retained the original source. An unclosed node bracket produced a visible syntax error; the source was restored afterward.

These are manual checks of the hosted app, not tests of a newly built local application. Export/import, large diagrams, rapid edits, mobile usability, and other diagram types remain unverified.

## Existing implementation

Local upstream snapshot: afa3a653fc5d2b742adcbd5a6063187b056d2419.

- upstream/packages/excalidraw/components/TTDDialog/MermaidToExcalidraw.tsx owns source input, deferred conversion, error state, and insertion.
- upstream/packages/excalidraw/components/TTDDialog/common.ts converts the parser's skeleton elements to Excalidraw elements, renders the preview, and inserts elements plus files.

Source inspection identifies a concern to reproduce and fix: conversion data retains the last successful result when parsing fails or input is cleared, while the insertion handler reads that data. The new handoff must associate each conversion with its exact source revision and block stale insertion through both button and keyboard paths. This concern is not yet an experimentally confirmed bug.

## Proposed handoff contract

Track source revision and conversion status: empty, pending, valid, invalid, or unsupported. A conversion response may become current only if its revision still matches the editor. Enable Continue to canvas only for a valid current result.

Store Mermaid source, converter version, conversion warnings, and the resulting editable scene together as a draft. Save the edited scene separately from the generated baseline. Generate another draft after source changes; do not silently overwrite an edited scene.

For the first release, accept flowcharts. Inspect converted output for image elements and report any image fallback before proceeding. Specialized shape fidelity requires fixture-based checks against the selected converter version.

## Sources and version caveat

- https://github.com/excalidraw/excalidraw
- https://github.com/excalidraw/mermaid-to-excalidraw
- https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api

The converter documentation describes flowchart-only editable support, while the hosted UI lists flowchart, sequence, class, and entity-relationship support. Use the actual pinned converter version and tested fixtures as the release authority, rather than promising compatibility from either list alone.
