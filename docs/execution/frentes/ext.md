# F9 · Extensibilidad sin fingir .NET

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/lisp/**`
- `apps/web/src/lib/plugins/** (nuevo si no existe)`
- `packages/design-sdk/**`
- `docs/api/**`
- `apps/web/src/app/docs/api/**`

## Cola

1. SDK de plugins JS como contrato público versionado: sandbox, permisos declarados, ciclo de vida, API estable de documento/comandos/UI, documentación de desarrollador y dos plugins de ejemplo.

2. AutoLISP: las funciones `vl-*`/`vla-*` más usadas por rutinas de despacho, DCL completo, y un corpus de rutinas LISP reales de internet **con licencia clara** como prueba de compatibilidad, con su procedencia registrada.

3. Tokens de API por organización y webhooks documentados (el outbox ya existe).

4. Marcar visibilidad por operación en el contrato (P1-5, abierto).

5. Declarar el puente .NET/VBA como imposible con honestidad y dejar escrita la alternativa (este SDK).

## Cierre

Fila de automatización sin criterios abiertos salvo el .NET declarado imposible.

## Lo que hay que tener presente

El corpus LISP ajeno necesita licencia y procedencia escritas antes de entrar. La red sólo alcanza GitHub.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/ext-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-ext` sobre la rama `campana/superar/ext`. Commits sí;
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
cd /home/user/vd-ext
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
