# Campaña «Superar a AutoCAD completo» — 4 de septiembre de 2026

Bitácora del coordinador. Si un contexto se compacta, este archivo se relee primero.

## El corte

- `valle-design` @ `25898dc6` (rama de trabajo `claude/superar-autocad-coordinator-lwl3ul`,
  que va por delante de `main` @ `1478471`; el corte que la campaña llama «main» es este).
- `valle-design-dwg-conformance` @ `aa2f561`.
- Rúbrica al arrancar: **232/271 (85.6 %)** destino · **176/197 (89.3 %)** hoy ·
  5 pt con evidencia independiente · **29 filas** retienen 1 pt por carecer de evidencia ajena.
- Criterios abiertos (⬜) al arrancar, 10 pt en total:
  | pt | criterio | frente |
  |---:|---|---|
  | 1 | Estrés de navegador con trazos densos (100k) con artefacto por corrida | F2 |
  | 1 | `architecture@100k` cumple el SLO (≤5 s detalle, ≥30 fps paneo p95) | F2 |
  | 1 | Kernel WASM con paridad verde **y enchufado** desde fuera de `lib/cad/wasm` | F2 |
  | 2 | Corpus DXF de terceros, autorizado y diverso, con matriz por entidad | F11 |
  | 2 | Vectorizar líneas y textos de un escaneo a entidades | F8 |
  | 1 | DWG: integración en runtime con gates legal, seguridad y fidelidad | F1 — **requiere firma del titular**, no se enciende aquí |
  | 2 | Puente .NET/VBA | declarado imposible; F9 documenta la alternativa |
- Typecheck y build del corte: **verdes** (`npm run typecheck`, 8/8 tareas, 52 s).

## El entorno (y lo que impone)

- 4 CPU, 15 GB RAM, 28 GB de disco libre. El techo de concurrencia de agentes es
  `min(16, nproc-2)` = **2**. Los once frentes existen y tienen cola, pero avanzan
  de dos en dos por orden de prioridad; R8 se cumple en su intención (paralelismo real
  hasta donde la máquina lo sostiene), no en su cifra.
- Red: `raw.githubusercontent.com` responde 200; la web general la deniega la política
  de egreso (Wikipedia 403). El corpus ajeno de F11 sólo puede venir de GitHub con
  licencia clara, y así se registra.
- Cada frente tiene su árbol propio (`git worktree`) con `node_modules` enlazado por
  hardlink desde el árbol principal: 11 copias ocupan 1.2 GB en total, no 13 GB.

## Territorios y ramas

| Frente | Rama | Árbol |
|---|---|---|
| F1 DWG en producto | `campana/superar/dwg` | `/home/user/vd-dwg` |
| F2 Velocidad sentida | `campana/superar/velocidad` | `/home/user/vd-velocidad` |
| F3 3D honesto (dueño del monolito) | `campana/superar/tresd` | `/home/user/vd-tresd` |
| F4 Express y universal | `campana/superar/express` | `/home/user/vd-express` |
| F5 Architecture 4/4 | `campana/superar/architecture` | `/home/user/vd-architecture` |
| F6 MEP y Plant 3D | `campana/superar/mep-plant` | `/home/user/vd-mep-plant` |
| F7 Mechanical y Electrical | `campana/superar/mech-elec` | `/home/user/vd-mech-elec` |
| F8 Map 3D y Raster Design | `campana/superar/map-raster` | `/home/user/vd-map-raster` |
| F9 Extensibilidad | `campana/superar/ext` | `/home/user/vd-ext` |
| F10 Escritorio, sin internet e inglés | `campana/superar/desktop` | `/home/user/vd-desktop` |
| F11 Evidencia independiente | `campana/superar/evidencia` | `/home/user/vd-evidencia` |

## Bitácora

### C0 · Corte inicial (2026-09-04)

- `npm ci` reproducible; `npm run typecheck` verde; suite completa lanzada como línea base.
- Once árboles de trabajo creados desde `25898dc6`, con `node_modules` por hardlink.
- Rúbrica medida y sus criterios abiertos repartidos por frente (tabla de arriba).
- Escritos este archivo, los once `docs/execution/frentes/<frente>.md` y sus
  `-peticiones.md`.

