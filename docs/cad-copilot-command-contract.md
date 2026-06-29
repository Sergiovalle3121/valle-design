# CAD Copilot Command Contract

## Scope

This contract defines the local, deterministic command surface for the AXOS CAD Copilot. It is intentionally UI/backend/model agnostic: React, three.js, NestJS, OpenAI, and CIDE integrations must call this layer rather than embedding command behavior directly in the prompt or UI.

## Current registry

The command registry lives in `apps/web/src/lib/cad/commands/registry.ts` and is typed by `apps/web/src/lib/cad/commands/types.ts`.

| Command id               | Category | Purpose                                                         | Example                                         |
| ------------------------ | -------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `create_clearance_aisle` | layout   | Create a measurable aisle/clearance between two layout objects. | `haz un pasillo de 1.2m entre SMT e inspección` |
| `align_selection`        | layout   | Align selected objects to a shared edge or centerline.          | `alinea las estaciones seleccionadas al centro` |
| `distribute_selection`   | layout   | Distribute selected objects with equal spacing.                 | `distribuye horizontalmente`                    |
| `connect_flow`           | flow     | Create sequential flow connectors between stations.             | `conecta flujo de SMT a inspección`             |
| `arrange_line`           | layout   | Propose a simple sequence-based station arrangement.            | `acomoda la línea de izquierda a derecha`       |
| `arrange_flow_line`      | flow     | Arrange selected objects by sequence and add flow connectors.   | `acomoda y conecta la linea de flujo`           |
| `measure_distance`       | analysis | Measure center-to-center distance between two objects.          | `mide distancia entre AOI y empaque`            |
| `find_collisions`        | analysis | Detect basic bounding-box overlaps.                             | `encuentra colisiones`                          |
| `validate_layout`        | analysis | Build the combined validation report for layout readiness.      | `valida el layout`                              |
| `fit_to_view`            | viewport | Ask the UI to focus the layout or selection.                    | `enfoca la selección`                           |

## Function-calling shape

The registry exposes `openAiCompatibleToolSchemas()` so a future OpenAI-compatible model can advertise the same command ids and parameters. The model should return a command id plus JSON arguments; the UI must still run local validation, preview, and explicit user confirmation before applying mutations.

Minimal flow:

1. User writes natural language.
2. Local parser or model returns `CadCommandInput`.
3. UI calls `previewCadCommand(input, context)`.
4. UI displays interpreted parameters, affected objects, operations, and issues.
5. User confirms.
6. UI calls `executeCadCommand(input, context)` and applies returned operations through existing editor primitives.
7. UI records a `CadCommandHistoryItem` for undo/redo.

## Workbench keyboard entry points

The shortcut registry lives in `apps/web/src/lib/cad/keyboard-shortcuts.ts`. `Layout3DEditor.tsx` uses it for local workbench actions and reuses the existing toolbar/export/validation handlers:

- `Ctrl/Cmd+K`: open the CAD command palette.
- `V`, `M`, `A`, `L`, `Z`, `I`, `T`, `F`: select, measure, aisle command prep, connect flow, insert zone, open equipment, add text note, fit view.
- `G`, `O`: toggle grid visibility and object/DXF snapping.
- `Shift+V`, `E`: run layout validation and open DXF export.
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`: undo/redo through the existing editor history path.

## Data boundaries

A model may see only the minimum geometry needed to interpret a command:

- object ids
- object labels
- object type (`station` or `asset`)
- bounding boxes
- current selection
- footprint size and unit

A model must not receive:

- customer names or commercial data
- operator names, employee data, or HR details
- supplier data
- production volumes unless explicitly required and approved
- raw uploaded customer drawings unless the deployment is self-hosted CIDE and policy allows it

## Privacy rule

The command engine is vendor-neutral. If the deployment points to self-hosted CIDE through an OpenAI-compatible `baseURL`, command metadata stays inside AXOS infrastructure. If an external OpenAI endpoint is used, only minimized command context may be sent and sensitive plant/customer data must be redacted first.

## Current limitations

- `Layout3DEditor.tsx` now consumes command previews for the dock, but only as textual/operation previews.
- Visual ghost previews are not implemented yet; textual/operation previews are the first contract.
- Collision detection is basic axis-aligned bounding-box detection and intentionally ignores rotation for now.
