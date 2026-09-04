# F6 · Toolsets MEP y Plant 3D

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/mep*`
- `apps/web/src/lib/cad/plant*`
- `apps/web/src/lib/cad/pid*`
- `apps/web/src/lib/cad/engine/commands/pipe*|duct*|cable*|mep*|pid*`
- `specs y goldens`

## Cola

1. MEP 3D: ruteo con conectores y elevación, accesorios deducidos por especificación, detección de interferencias con arquitectura, esquemas verticales, y cuantificación con longitudes reales del 3D.

2. Plant: specs de tubería, sólido de tubería en el visor 3D, detección de choques, ortográficos desde el modelo, P&ID↔3D bidireccional, y catálogo ampliable por la organización.

## Cierre

Filas MEP y Plant a 4/4 salvo evidencia independiente.

## Lo que hay que tener presente

Catálogo de FABRICANTE no se finge: el catálogo es propio y ampliable por la organización, y se dice así. Nada de vocabulario ERP/MES (`check:no-industrial-domain`).

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/mep-plant-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-mep-plant` sobre la rama `campana/superar/mep-plant`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-mep-plant
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### R0 · Reconocimiento del territorio (2026-09-04)

Leí la ficha, el corte de campaña y AGENTS.md, y **medí lo que ya existe** antes de
planear nada. Lo construido, con su tamaño:

- **MEP (Ola F, 2026-09-02)** — `mep-support.ts` (diez servicios con capa, color y tipo de
  línea; doble línea a inglete), `mep-symbols.ts` (ocho bloques dibujados),
  `mep-schedule.ts` (cuadro de instalaciones), órdenes `PIPE`/`DUCT`/`CABLETRAY`
  (`mep-tracing.ts`, 195 líneas) y `MEPSYMBOL` (`mep-symbol.ts`). **Todo en planta, z = 0**:
  `lift()` de `mep-tracing.ts` escribe `z: 0` en cada vértice y `cadPathLength` mide en 2D.
- **Plant (Ola 6, 2026-09-03)** — `plant/line-numbers.ts` (número de línea
  `6"-P-1001-CS150` con sus cuatro hallazgos), `plant/equipment-tags.ts`,
  `plant/pid-symbols.ts`, `plant/pipe-route.ts` (346 líneas: rutas 3D con cota, accesorios
  DEDUCIDOS —codo, te, reducción— y cuatro hallazgos), `plant/pipe-mto.ts` (lista de
  materiales del modelo, con su límite escrito en el título del cuadro),
  `plant/isometric.ts` (isométrico con longitudes verdaderas). Órdenes: `PIDLINE`,
  `PIDLIST`, `PIDEQUIP`, `PIDEQUIPLIST`, `PIDROUTE`, `PIDMTO`, `PIDISO`, todas en la cinta
  (panel «Instalaciones», `ribbon.ts:146`).

Lo que **falta de verdad**, y coincide con lo que la propia rúbrica declara en el `gap` de
`toolset-plant3d`: sólido de tubería con diámetro en el visor 3D, detección de choques
contra estructura, y —de mi cola— la mitad 3D de MEP (cota, metros reales, interferencias),
el catálogo de especificación ampliable por la organización y la conciliación P&ID ↔ 3D.

Tres restricciones que descubrí midiendo, y que deciden la forma de la cola:

1. **Una orden NUEVA cuesta dos archivos fuera de mi territorio.** `ribbon.ts` y
   `docs/cad/evidence/ui-command-reach.json` (que `npm run check:cad` compara contra el
   registro). Una orden nueva dejaría `check:cad` en rojo en este árbol hasta la ventana de
   integración. **Decisión: la cola no añade órdenes**; cuelga de PIDROUTE, PIDMTO, PIDLIST,
   PIPE, DUCT y CABLETRAY, que ya tienen botón. Queda escrito como P-mep-plant-02 por si el
   titular prefiere PIDCLASH/PIDSOLID propios.
2. **El barrido del kernel se estrecha en las esquinas, y se mide.** Prototipé el sólido de
   tubería con un nodo `sweep` de `solid3d` (6", camino de 5 m + montante de 3 m, perfil de
   16 lados) y medí con `solid3dMassProperties`: sin densificar el camino el cuerpo pierde
   **13,6 %** de volumen contra el cilindro teórico (122 931 071 vs 142 209 817), porque el
   perfil se coloca en el plano bisector y la sección se interpola desde el arranque. Con
   puntos extra a ±200 mm del vértice queda en 0,73 % y a ±100 mm en **0,37 %**. Ésa es la
   cifra que la spec de T2 va a fijar, y por eso T2 no es «llamar a sweep».
3. **El sólido `solid3d` ya se ve y ya se corta.** `flatshot-solids.ts:183` recoge
   `entity.type === "solid3d"`, así que emitir el tubo como `solid3d` lo pone en el visor 3D
   **y** en FLATSHOT sin tocar nada de F3 — los ortográficos desde el modelo salen de
   propina, no como entrega aparte.

## «Todavía no»

_(sin entradas todavía — las de la campaña se declaran al cerrar cada entrega)_
