# Informe de la campaña «El lunes de un arquitecto» · 2026-09-06

Cierre del coordinador (F0/F1) a las 22:25 UTC. La orden completa está en
`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`; el diario entrada por
entrada en `CAMPANA_LUNES_20260906.md`; las decisiones tomadas sin preguntar,
con sus cuatro campos, en `DECISIONES_20260906.md`. Rama `claude/valle-design-auditoria-bhin78`,
PR #194 contra `main`. Ninguna cifra de este informe se escribió a mano: cada
una se transcribe de la salida del script que la computa, con la hora, y se
vuelve a obtener corriéndolo.

## 1 · De dónde se partió y qué se midió

La auditoría de veinte dimensiones (`docs/execution/auditoria-fable/dimensiones/`)
puso **5,15/10** al mismo producto que la rúbrica competitiva medía en torno al
90 %. Las dos cifras miden cosas distintas: la rúbrica, si la capacidad existe
con evidencia; la auditoría, si un arquitecto puede usarla el lunes. La
campaña atacó la segunda sin dejar caer la primera, y **la auditoría de veinte
dimensiones NO se ha vuelto a correr hoy**: lo que este informe puede afirmar es
qué defectos de aquella auditoría se cerraron con prueba, no una nota nueva.

Salida de `node scripts/cad/rubric.mjs` a las 22:25 UTC (transcrita):

```
ALCANCE DE HOY   186/213 (87.3 %) — flujo diario de dibujo 2D técnico; la cifra de cliente.
ALCANCE DESTINO  256/309 (82.8 %) — AutoCAD completo; la cifra de inversionista. Lo excluido de hoy es «todavía no», nunca «nunca».
```

Al abrir la Ola 0 (T-02) el denominador de HOY subió a 213 y el de destino a
309 con filas nuevas en «todavía no» (comercial, navegador, degradación, cinta,
accesibilidad): el porcentaje bajó a propósito para que las filas dijeran la
verdad, y desde ahí subió con evidencia, nunca con puntos regalados. Lo que sube
la cifra de HOY a partir de aquí es evidencia independiente en las filas que la
retienen (`docs/cad/evidence/independencia-por-fila.json`, regenerado hoy) y
las filas «todavía no» que se cierren con golden.

## 2 · Lo que cambió hoy, ficha a ficha

Estado según la bitácora (ARREGLADA/HECHO = con prueba verde sobre el build de
producción o en CI; PARCIAL = una parte; EN PR = cerrada en la rama de un frente
que aún no está integrada; — = sin tocar hoy).

| Ola | Ficha | Estado | Dónde |
| --- | --- | --- | --- |
| 0 | T-00 monolito ≤ 17 250 | HECHO (18 453 → 17 235 líneas, 131 → 118 `useState`; el techo es exacto y sólo baja) | `DEUDA-MONOLITO.md`, `scripts/cad/monolith-budget.json` |
| 0 | T-01 graduar catorce pruebas | HECHO (techo de auditoría 28 → 9) | `e2e/golden/101-119` |
| 0 | T-02 filas nuevas en la rúbrica | HECHO | `rubric.json`, `ESCALERA.md` |
| 0 | T-03 evidencia independiente | HECHO por F10 (#197): pyproj, openapi-spec-validator, HMAC, mpmath, atheris | `docs/cad/corpus/oraculos/` |
| 0 | T-0D higiene documental | HECHO en tres tandas (84 hallazgos aplicados y revisados por adversario) | `docs/history/`, ADR con notas fechadas |
| 1 | T-10 éxitos falsos del 3D | (b) HECHO por F2; (a) PARCIAL por F5 | `extrude`, `presspull` |
| 1 | T-11 pérdidas silenciosas del DXF | (b) HECHO; (a)(c) EN PR #196 (F4, rojo) | `dxf-export` |
| 1 | T-12 controles que prometen | ·1 Versiones, ·2 PNG, ·4/·5 Ctrl+K HECHO; ·3 PAGESETUP EN PR #196 | goldens 190, 191 |
| 1 | T-13 tema que borra el plano | EN PR #200 (F9; queda abierto, D-17) | `render-style.ts` |
| 1 | T-14, T-21, T-22, T-23, T-24, T-25 bucle 2D | HECHO por F3 (#201), integrado | goldens 120-124 |
| 1 | T-15 etiqueta no dibujada | HECHO por F5 (#199), integrado | golden 140 |
| 1 | T-16 dos puertas de importación | HECHO | golden 192, `document-import-door.spec.ts` |
| 1 | T-17, T-18 a/b/d correos y portada | HECHO por F8 (#198), integrado | `email-template-coverage.spec.ts` |
| 1 | T-19 lo que se lleva en silencio | ·1 (F5) y ·2 (F3) HECHO; resto EN PR #196 | |
| 1 | T-20 el clic sobre el pinzamiento | HECHO (racimo B entero: once casos) | goldens 193-195 |
| 2 | T-30 dibujar sobre el papel | — | |
| 2 | T-31, T-33, T-35 | HECHO por F5, integrado | golden 140 |
| 2 | T-32 láminas en el DXF | — | |
| 2 | T-34, T-36 | EN PR #196 (F4, rojo por presupuesto del monolito) | |
| 3 | T-40 catálogo de xrefs | — | |
| 3 | T-41 capas de la xref | HECHO | golden 210, `xref-workflow.spec.ts` |
| 3 | T-42 nadie se entera | — | |
| 3 | T-43 dirección del plano | D1 HECHO por F2; resto — | |
| 4 | T-50, T-51, T-53 modelado 3D | — (el frente F7 no arrancó: sus dos sesiones quedaron bloqueadas por el filtro de seguridad de la plataforma) | |
| 4 | T-52 designar por la sombra | HECHO (racimo A: cota del puntero; racimo B: rayo de cámara) | goldens 198, 199 |
| 5 | T-60 a-d, T-61 | HECHO por F8, integrado | `commercial-seat-growth.pg.spec.ts` |
| 5 | T-62 expediente del comprador | a, b HECHO por F8, integrado; c a medias (exportar sí, borrar la cuenta en petición); d — | `audit-log-tenant-isolation.pg.spec.ts`, `sla-surface.spec.ts`, `identity-export.pg.spec.ts` |
| 5 | T-63 primeros cinco minutos | d (parte 1), e, f HECHO; a-c — | goldens 150, 196, 197 |
| 5 | T-64 configuración compartida | — | |
| 6 | T-70, T-71 rendimiento y guardado | — | |
| 6 | T-72 e/f/h, T-75 b/c/d/f/g/h, T-74 | EN PR #200 (F9; su regresión de Enter corregida en 160cd14; queda abierto, D-17) | |
| 6 | T-73 accesibilidad | — (la fila existe en la rúbrica desde T-02) | |

Cifras de la rama a las 22:25 UTC, computadas con `git`:

```
commits sobre main:  92   (git rev-list --count origin/main..HEAD)
goldens nuevos:      41   (git diff --name-only origin/main...HEAD -- apps/web/e2e/golden)
specs tocados:       116
techo de auditoría:  5   (apps/web/e2e/auditoria/manifiesto.json; nació en 28)
```

## 3 · Los frentes paralelos

| Frente | PR | Estado a las 22:25 UTC |
| --- | --- | --- |
| F2 · Verdad de superficie | (árbol aparte, ya en la rama) | integrado |
| F3 · Bucle 2D | #201 | integrado en #194; peticiones P-01…P-04 aplicadas |
| F4 · Papel y entrega | #196 | **rojo** desde las 19:46: `check:monolith-budget` (`cad-document.ts` 804 > 800 sin presupuesto; `paper-space.ts` 982 > 896); la sesión, ociosa desde las 19:48, recibió el diagnóstico exacto con plazo 23:00 UTC; no integrado |
| F5 · Toolsets | #199 | integrado en #194 |
| F7 · Modelado 3D | — | **no arrancó**: dos sesiones bloqueadas por el filtro de la plataforma («no actual user request»); T-50/T-51/T-53 quedan abiertas |
| F8 · El despacho | #198 | integrado dos veces (d8acb66 y 89ac122: T-62 a/b/c); Contrato verde en su rama y E2E en curso al integrar; el árbol fusionado pasó tsc, gates, 649 specs y los goldens 197, 150, 196 y 210 |
| F9 · Cimientos y piel | #200 | **queda abierto** (D-17): la cabeza 096e8bf tenía catorce goldens rojos (la sugerencia de la línea de comandos de T-74 se comía el Enter y «L» ejecutaba otro comando); la sesión lo detectó y corrigió sola (160cd14, 22:11 UTC); su fusión cruza `dashboard/page.tsx`, que F8 partió de otra manera, así que la resuelve la sesión F9 sobre `main` cuando #194 aterrice |
| F10 · Evidencia independiente | #197 | integrado |
| F11 · Inventario AutoCAD | #195 | integrado |

## 4 · Qué tan cerca está de que un arquitecto prefiera Valle Design a AutoCAD

Con honestidad de rúbrica, no de portada:

**Lo que hoy sí aguanta un lunes.** El bucle 2D de arquitectura —dibujar,
imantar, designar, modificar, acotar, capas, bloques, DXF de ida y vuelta con
oráculo ajeno— tiene golden de navegador en cada gesto que la auditoría
encontró roto: el clic sobre el pinzamiento, el punto bajo un SCU inclinado, la
designación en 3D, «Versiones», las dos puertas de importación, las capas de la
xref, la cuenta con términos, el primer minuto con arrastrar-y-soltar. Once
pruebas que la auditoría dejó rojas a propósito pasan hoy y defienden el
arreglo desde `e2e/golden/`. La cifra de HOY de la rúbrica es la de arriba.

**Lo que impide decir «prefiere Valle Design» a un despacho real, en orden:**

1. **DWG.** Es la lengua franca del mercado y sigue apagado a propósito
   (`DWG_IMPORT_FLAG`/`DWG_EXPORT_FLAG` en `false`). Existe la beta de
   importación firmada (AC1015, apagada por variable de build) y el laboratorio
   clean-room lee versiones modernas; falta el dictamen jurídico y la decisión
   del titular. Sin DWG de entrada y salida, un despacho no puede sustituir
   AutoCAD; puede convivir con él por DXF.
2. **El papel.** Dibujar sobre la presentación (T-30) y llevar las láminas en el
   DXF (T-32) siguen sin hacerse; T-34/T-36 (esquinas y escala anotativa) están
   en el PR rojo de F4. Entregar a un cliente sigue siendo PDF a escala, que sí
   existe y está probado.
3. **Trabajar con otros.** El catálogo de xrefs (T-40: hoy se adjunta tecleando
   el identificador) y los avisos de colaboración (T-42) no se tocaron; las
   capas de la xref sí (T-41).
4. **3D fuera del navegador.** El modelo no sale (T-51) ni se gira con esquema
   persistido (T-50): el frente que lo iba a hacer no arrancó.
5. **Rendimiento.** La rúbrica lo dice sola: el SLO de navegador sobre la mezcla
   `architecture@100k` no se cumple (`docs/cad/evidence/browser-slo-100k.json`).
6. **Corpus ajeno con derechos.** La compatibilidad «real» con dibujos de
   terceros sigue midiéndose sobre un corpus sin firma de derechos (fila
   `dxf.corpus-external`, declarada).

**Lectura del coordinador.** Para un despacho de arquitectura 2D que intercambia
DXF y entrega PDF, el producto está a **semanas** de un piloto controlado: cerrar
el PR de F4 (papel), fusionar F9 (cimientos y piel, ya corregido), volver a correr la auditoría
de veinte dimensiones para tener una nota nueva y no una inferencia, y decidir la
beta DWG con su dictamen jurídico. Para que un arquitecto lo **prefiera** a
AutoCAD en general —DWG en producción, papel completo, xrefs con catálogo, 3D
que sale, 100k entidades fluidas— la distancia es de **meses** de olas como la de
hoy, y la rúbrica de destino (`ALCANCE DESTINO`, arriba) es la que hay que mirar.

## 5 · Lo que queda escrito para la siguiente sesión

- #194 se fusiona en `main` con el CI verde de su cabeza final; el cuerpo del
  PR lleva el estado. F9 (#200): su sesión fusiona `origin/main`, resuelve
  `dashboard/page.tsx` y regenera el trinquete de lint (D-17); F4 (#196)
  cuando parta `cad-document.ts` y `paper-space.ts` (o partirlos desde el
  coordinador).
- Volver a correr la auditoría de veinte dimensiones sobre `main` para tener
  la nota nueva.
- T-50/T-51/T-53 (3D) con una sesión de frente que arranque como usuario, no
  por notificación: el filtro de la plataforma bloqueó las dos de hoy.
- T-30, T-32, T-40, T-42, T-70, T-71, T-73: sin tocar; sus fichas siguen
  vigentes en el prompt maestro.
- La decisión DWG (beta y dictamen) es del titular; el código está listo para
  encender una variable, no para escribir código (ADR-0009).
