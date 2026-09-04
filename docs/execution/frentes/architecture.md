# F5 · Toolset Architecture a 4/4

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/architecture*`
- `apps/web/src/lib/cad/bim-*`
- `apps/web/src/lib/cad/engine/commands/wall*|door*|window*|stair*|roof*|slab*|space*|elevation*|section*`
- `apps/web/src/lib/cad/ifc* (nuevo)`
- `specs y goldens`

## Cola

1. Estilos de muro compuestos multicapa con prioridad de limpieza en las uniones; puertas y ventanas por catálogo con estilo.

2. Espacios/zonas con etiqueta y cuadros automáticos de superficies (útil y construida) por norma mexicana.

3. Cortes y alzados que se ACTUALIZAN al cambiar el modelo (hoy se generan una vez y no se refrescan).

4. Fases existente/demolición/nuevo con su representación.

5. Escaleras por norma con descansos, y cubiertas a varias aguas.

6. IFC 4 básico de exportación (muros, huecos, losas, niveles), verificado con un lector IFC de terceros como binario; si no se puede instalar, se declara.

## Cierre

Fila Architecture 4/4 salvo el punto de evidencia independiente; ESCALERA Ola E cerrada.

## Lo que hay que tener presente

Modelar volúmenes NO hace de esto BIM: `bim-claim-boundary.spec.ts` sigue mandando. `wall` y `opening` siguen paramétricos.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/architecture-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-architecture` sobre la rama `campana/superar/architecture`. Commits sí;
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
cd /home/user/vd-architecture
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
