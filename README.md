# AOS Deck Studio

Customer deck design tool for AOS Home Solutions. Single-file, dependency-free web app (vanilla JS + WebGL), served on staging by a Cloudflare Worker.

- `index.html` — the full application. Baseline is V5.0 "Brand Logo Update" (`AOS_Deck_Studio_V5_0_Brand_Logo_Update.html`), byte-identical in code to staging at https://sweet-dawn-8523.andrew-8b7.workers.dev/ as of 6 Nov 2026.

## Inline modules in `index.html`

| Global | Role |
| --- | --- |
| `AOSFramingSolver` | R507-based joist span screening |
| `AOSSharedSupport` | Shared bearing-line / beam layout |
| `AOSGeometry` | Planar polygon helpers |
| `DeckCore` | Design intent → sanitize → `make()` physical parts, counts, alerts |
| `Deck3D` | WebGL renderer |
| `AOSShape` | Angle-locked shape edits and edge remapping |
| (app controller) | 8-step UI, 2D plan, undo/redo, save/open, concept export |

## Status

Design preview only. Framing output is a preliminary concept, not engineered plans or code approval. Production review is required.

## Deployment

No deployment from this repository without explicit owner approval.
