# F3 · El 3D honesto (dueño del monolito)

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/brep/**`
- `apps/web/src/lib/cad/solid*`
- `apps/web/src/lib/cad/wall-*`
- `apps/web/src/components/cad/viewport/**`
- `apps/web/src/components/cad/editor/**`
- `apps/web/src/lib/cad/engine/commands/solid*|3d*|section*|render*`

## Cola

1. Entidad con normal: círculo, arco y polilínea con bulge en plano inclinado, guardados y dibujados. El cambio de esquema (`cad-entities-v*.ts`, `cad-document*.ts`) es de archivo compartido: se PIDE al coordinador con el diseño completo por `tresd-peticiones.md`; migración ADITIVA, nunca destructiva.

2. Cota Z visible: la geometría 2D deja de aplastarse al suelo en el visor 3D (los sólidos ya van a su altura; la contradicción se ve en cualquier planta con niveles).

3. SOLIDEDIT completo: las once ramas restantes (mover/girar/desfasar/inclinar/borrar/copiar/color de cara; copiar/color de arista; estampar/vaciar/limpiar de cuerpo).

4. Modos de las primitivas: CYLINDER 3P/2P/Ttr/Elíptico, CONE, PYRAMID Arista, POLYSOLID Arco.

5. SECTIONPLANE con bloque 2D/3D generado y sección viva (LIVESECTION). FLATSHOT ya existe: completar la familia.

6. Materiales por objeto, luces y cámaras con nombre, y un render presentable en el navegador (PBR + sombras + entorno con three.js, exportable a imagen). No es fotorrealismo de trazado de rayos y se dice así.

7. ANIPATH: grabar el recorrido a video.

## Cierre

Goldens por capacidad; ESCALERA con los «todavía no» de la Ola C cerrados o re-declarados con fecha.

## Lo que hay que tener presente

Eres el ÚNICO frente autorizado a tocar `Layout3DEditor.tsx` en esta ventana (R4). El presupuesto del monolito sólo puede BAJAR: si extraes, corre `node scripts/cad/check-monolith-budget.mjs --update`. El 3D es FACETADO y se dice así; nada de fingir kernel exacto.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/tresd-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-tresd` sobre la rama `campana/superar/tresd`. Commits sí;
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
cd /home/user/vd-tresd
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · SOLIDEDIT gana tres ramas (entrega 1/5)

De tres operaciones a **seis**. Lo nuevo, y por qué el kernel ya lo sostenía:

- **Cara · Desfasar** — el nodo `push` de PRESSPULL con el signo de AutoCAD
  (positivo hacia fuera). Reutiliza `withPushedFace` entero; no hay una segunda
  versión que se pueda desincronizar. Se ofrece por su nombre porque la Desfasar
  de AutoCAD es EXACTAMENTE esto y aquí está completa, mientras que su Extruir
  admite además trayectoria y ángulo de inclinación que este nodo no lleva.
  Medido: caja 100×100×50 con d = +20 → 700 000; con d = −20 → 300 000; UN solo
  nodo `push` y la caja sigue debajo (reeditable, no horneado).
- **Cara · Copiar** — los lazos de la cara resueltos con `cadResolveFaceRef` +
  `faceOuterLoop`/`faceInnerLoops`/`loopPoints` salen como una entidad `region`
  en coordenadas del mundo con su z real. Mismo camino que SECTION
  (`solids-modify.ts`), no se inventó transporte. Medido: la tapa de esa caja da
  UNA región de 4 puntos con z = 50, sin `inners`, y el sólido no se toca.
- **Arista · Copiar** — las aristas del sólido designado salen como entidades
  `line` con `start`/`end` en `CadPoint3`. Medido: 12 líneas por caja, ninguna
  repetida (par de vértices normalizado y cuantizado), 8 de 100 y 4 de 50.

El diálogo deja de anunciar como ausentes las tres que ya existen y **nombra una
por una** las que no, en el renglón del prompt de su rama y nunca como opción
pulsable: el analizador sólo reconoce las palabras clave que el prompt ofrece,
así que ofrecer «Mover» para responder «todavía no» sería fabricar una opción
que no hace nada.

No se tocó el registro, ni la cinta, ni el esquema. Las operaciones viven en
`solids-edit-branches.ts` (nuevo, 307 líneas) y `solids-edit.ts` se queda con el
diálogo (359).

Evidencia: `npx tsx src/lib/cad/engine/commands/solids-edit.spec.ts` → 60
comprobaciones (eran 24). `npm run check:command-integrity` → OK, 274 comandos,
SOLIDEDIT sigue en «informa». `npm run typecheck` → 8/8. Presupuesto de monolito
intacto.


## «Todavía no»

### 2026-09-04 · Designar UNA arista suelta

`SOLIDEDIT Arista Copiar` copia **todas** las aristas del sólido designado, no
la que se señale. Motivo escrito: `CAD_ACCEPT_EDGE_PICK` no existe (cero
apariciones en el árbol) y crearlo obliga a tocar
`apps/web/src/lib/cad/engine/command-types.ts`, que está **fuera** del territorio
de este frente. Pedido con su diseño completo en `tresd-peticiones.md`
(**P-tresd-02**); la rama lo dice en su propio prompt en vez de fingir una
designación fina.

### 2026-09-04 · Las ocho ramas de SOLIDEDIT que siguen fuera

Nombradas una por una en el prompt de su rama, con su motivo en la cabecera de
`solids-edit.ts`. Son ocho operaciones distintas y nueve renglones, porque Color
aparece en dos ramas por el mismo motivo:

| Rama                                    | Motivo                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| Cara · Mover, Girar, Inclinar, Borrar   | piden recomponer las caras adyacentes; el kernel no rehace una cara movida |
| Color (de cara y de arista)             | el esquema no guarda un atributo por cara ni por arista       |
| Cuerpo · Estampar, Vaciar (SHELL), Limpiar | sin operación de kernel                                    |

### 2026-09-04 · El resumen de la paleta se quedó corto

`engine/command-summaries.ts:248` sigue describiendo el SOLIDEDIT de tres ramas.
Es archivo fuera de territorio; pedido en `tresd-peticiones.md` (**P-tresd-01**)
con el renglón exacto de sustitución.
