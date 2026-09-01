# Dependencias mayores diferidas

Documentación viva de qué actualizaciones mayores de dependencias están
bloqueadas y por qué. Migrado desde la rama `deps/majors-diferidos-20260822`
(y su PR #87, "NO fusionar") el 2026-08-24, campaña de cierre de ramas —
la rama existía sólo para documentar esto y nunca debía fusionarse; su
`package.json` fijaba las versiones bloqueadas de vuelta, lo que habría sido
una regresión real si se hubiera integrado.

Los tres grupos que SÍ pasan la suite completa **ya están en `main`**
(`9ab69f8`): `@nestjs` 11.2 con overrides, `three`/`framer-motion`/`lucide`,
`@redocly/cli` 2. Lo que sigue en esta tabla es lo que queda, cada bloqueo
**probado empíricamente** durante la campaña de cimientos (2026-08-22) — no
actualizar hasta tachar la fila correspondiente con la evidencia de que el
bloqueo se resolvió.

| Paquete | Bloqueo verificado | Cómo se destraba |
|---|---|---|
| typescript 7.0.2 | `packages/dwg-codec/scripts/check-boundary.ts` usa `ts.SourceFile`/`ts.Node`/`ts.isImportDeclaration` — TS7 los retiró del API de compilador. También ts-jest 29 (peer `<6.1`) y typescript-eslint | migrar el gate al nuevo API + ts-jest con soporte TS7 |
| eslint 10 + @eslint/js 10 + globals 17 | `@typescript-eslint/no-misused-promises` **crashea** (TypeError) bajo ESLint 10 con typescript-eslint 8.67, que es la **última** versión publicada | esperar typescript-eslint con soporte ESLint 10 |
| typeorm 1.1.0 | `peerOptional better-sqlite3 ^12` en conflicto con better-sqlite3 13 (subido en el mismo grupo, ya en main) | bajar better-sqlite3 a 12, o typeorm que acepte 13 |
| next 16.3.1 | Turbopack 16.3 es solo-nativo; el Control de aplicaciones de esta máquina bloquea `next-swc.win32-x64-msvc.node` (16.2 compila en WASM) | autorizar el binario, o `next build --webpack`, y medir |
| @types/node 26 | el runtime de release es Node 20 (`.nvmrc`, `ARG NODE_VERSION=20` en ambos Dockerfiles) | subir cuando el runtime sea 26 |
| @playwright/test 1.62.1 | navegador nuevo invalida las capturas golden | ventana dedicada con regeneración de goldens en frío |
| @nestjs/* 12 (`common`, `core`, `platform-express`, `typeorm`, `cli`, `schematics`, `testing`) | **DOS bloqueos medidos el 2026-09-01 sobre el PR #144.** (1) `@nestjs/schematics@12` arrastra `@angular-devkit/core@22.1.5`, cuyo `engines.node` exige `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`; el `.nvmrc` de este repo fija **20** y ambos Dockerfiles llevan `ARG NODE_VERSION=20`. (2) El propio PR de Dependabot **no instala**: `npm ci` sale con `EUSAGE` porque su `package.json` pide `@nestjs/common@12.0.1` y su lockfile sigue en `11.2.3`. | subir el runtime a Node 22.22.3+ (mismo desbloqueo que `@types/node`), y esperar un PR de Dependabot con lockfile coherente |
| actions de GitHub, saltos MAYORES (`checkout` 4→7, `setup-node` 4→7, `cache` 4→6, `upload-artifact` 4→7, `download-artifact` 4→8, `docker/*` 3→4 y 6→7) | El pinning por SHA de `scripts/check-proprietary-governance.mjs:223` exige revisión humana de cada versión nueva, **y eso es deliberado**. Pero un salto de tres o cuatro mayores no se revisa leyendo un SHA: `upload-artifact` v4→v5 ya trajo cambios incompatibles, y el único banco de pruebas de una action **es el propio CI**. Un PR semanal que nunca puede pasar el gate deja de ser una señal y pasa a ser ruido. | ventana dedicada: subir de un mayor por vez, actualizar el SHA pineado en el mismo commit, y validar con una corrida completa de CI |

Origen: partición del PR #86. 15 de 32 seguros entraron en `c034e0b`; 3 grupos
más verificados entraron en `9ab69f8`; queda esta tabla.

**Regla:** una ventana dedicada por grupo, nunca en mitad de una campaña de
goldens (ver `docs/execution/BACKLOG.md` P2-4).

## Reincidencia y cierre mecánico (2026-08-24)

El grupo semanal de Dependabot (`npm-semanal`, `patterns: "*"`) no excluía
nada, así que volvió a proponer exactamente este mismo bloque roto en un PR
nuevo (#96) el mismo día que se migró esta tabla desde el #87 — habría
repetido cada lunes indefinidamente. Se cerró el #96 sin fusionar (mismos
seis bloqueos, verificados de nuevo contra el diff real del PR) y se agregó
un bloque `ignore` a `.github/dependabot.yml` para los seis paquetes de esta
tabla, para que el grupo semanal deje de re-proponer lo ya probado roto y
sólo agrupe lo que sí es seguro. Al tachar una fila de esta tabla con
evidencia de que el bloqueo se resolvió, quitar también su entrada
`ignore` correspondiente en `dependabot.yml`.
