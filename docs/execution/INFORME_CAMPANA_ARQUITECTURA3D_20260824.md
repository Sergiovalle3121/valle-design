# INFORME — Campaña Arquitectura 3D, 24 de agosto de 2026

**Rama:** `claude/valle-design-3d-performance-sllcty` — cascada del 24 de agosto,
ítems **B.1**, **B.2** y **B.3** de un plan mayor que también corrió A.1–A.5 y
0.1–0.3 (rendimiento y ciclo de vida de escena) en la misma rama; este informe
cubre sólo el frente arquitectónico. Encargo: que el visor 3D deje de mostrar
sólo muros extruidos y muebles de línea de producción, y empiece a producir
piso/cielorraso/techo, materiales con textura real y mobiliario doméstico.
Commits propios: `7208612` (B.1) y `1cd0f43` (B.3); B.2 quedó completo en el
árbol de trabajo, sin commitear (ver nota de cierre).

## El hallazgo que ordena la lectura de este informe

**B.1 está terminado y probado, pero apagado.** `roof-floor-generation.ts`,
`roof-floor-three.ts` y `CadArchitecturalMassHost` existen, tienen specs
verdes y reutilizan exactamente la maquinaria que dicen reutilizar (verificado
línea por línea, ver abajo) — pero **ningún archivo del editor en vivo
instancia `CadArchitecturalMassHost`**. Se comprobó con una búsqueda en todo
el repositorio (`grep` de `CadArchitecturalMassHost`, `buildArchitecturalMassPlan`,
`buildCadRoomMassObject`, `buildCadRoofObject`): los únicos consumidores son
los tres specs del propio paquete. `Layout3DEditor.tsx` sí importa y monta a
`CadSolidShadeHost` (el anfitrión hermano que B.1 dice imitar) pero no
menciona `roof-floor` ni `architectural-mass` en ningún punto. Hoy, dibujar
cuatro muros cerrados en el editor real **no produce piso, cielorraso ni
techo en el visor** — la funcionalidad sólo existe si algo, fuera de la app,
llama a `buildArchitecturalMassPlan(document)` directamente. Cablear el
anfitrión es una tarea de una tarde (el patrón de `CadSolidShadeHost` ya está
escrito y probado) y es, con diferencia, el paso de mayor apalancamiento que
queda abierto — se detalla en «Siguientes pasos».

B.2 y B.3 no tienen ese problema en la misma forma, pero cada uno tiene el
suyo, más chico, documentado por su propio autor y verificado aquí de nuevo:
el picker de materiales (`CadMaterialPalette.tsx`) tampoco está cableado —
`materialId` sólo se puede fijar hoy escribiendo el documento a mano, no
haciendo clic en la app — mientras que los 6 arquetipos de B.3 **sí** se ven
y se colocan hoy mismo, porque se sumaron al catálogo que `Layout3DEditor.tsx`
ya consume.

## Cifras

| Qué | Antes | Después |
| --- | ---: | ---: |
| Arquetipos 3D (`AssetArchetype`) | 16 | **22** (+6: stairs, railing, sofa, bed, toilet, sink) |
| Entradas del catálogo de activos | 30 | **38** (+8) |
| Categorías del catálogo | 7 | **8** (+ "arquitectura" / «Arquitectura y mobiliario») |
| Materiales arquitectónicos con textura procedural | 0 | **6** (madera, concreto, ladrillo, vidrio, 2 pinturas) |
| Mapas de textura por material | 0 | **3** (color/normal/rugosidad), generados en `THREE.CanvasTexture`, cacheados por id |
| Entidades que pueden derivar piso/cielorraso/techo | ninguna | los muros nativos (`type: "wall"`) del documento, vía costura de HATCH reutilizada |
| Goldens Playwright de este frente | 0 | **1** (`58-cad-architectural-materials.spec.ts`), verde con captura real |
| Specs Node nuevos | 0 | **6** (3 de B.1, 2 de B.2, 1 de B.3) + 2 specs existentes extendidos por B.3 |
| Líneas nuevas (commits + árbol de trabajo) | — | B.1: 905 (6 archivos) · B.3: 866 ins./36 del. (7 archivos) · B.2: ~1099 en 6 archivos nuevos + 51 ins./7 del. en 7 archivos compartidos |
| `check:monolith-budget` | 1 problema (`pipeline.ts`, ajeno) | **2 problemas** — se sumó `asset-archetypes.ts` (862 líneas, tope 800) |

## B.1 — Piso, cielorraso y techo desde muros

**Archivos** (commit `7208612`, único; nada fuera de alcance):
`apps/web/src/lib/cad/roof-floor-generation.ts` (+spec),
`apps/web/src/lib/cad/roof-floor-three.ts` (+spec),
`apps/web/src/components/cad/viewport/architectural-mass-host.ts` (+spec).

**Qué hace, verificado leyendo el código, no sólo el resumen:**

- `wallLoops()` recorre `document.entities` de `type === "wall"` y llama
  `registry.adapter(wall).renderer.paths(wall, 192, document)` — **con
  documento**, el mismo patrón que usan `entity-three.ts`,
  `tessellation-cache.ts` y otros ocho módulos del repo para dibujar el
  inglete de los muros; confirmado que sin documento el adaptador entrega el
  contorno propio ya cerrado en vez de las caras abiertas que se sueldan
  entre vecinos (la razón que el propio comentario da para no usar
  `cadEntityBoundaryPaths`).
- La costura de esas caras corre por `stitchCadBoundaryPaths` +
  `cadBoundarySignedArea` de `hatch-associativity.ts` — **no reimplementadas**,
  son las mismas funciones que resuelven HATCH. El anillo de mayor área se
  toma como envolvente exterior, la misma regla que usa
  `cadHatchRegionFromObjects` (`engine/commands/hatch-support.ts`, línea 179:
  `Math.abs(cadBoundarySignedArea(loop)) > Math.abs(cadBoundarySignedArea(best))`) —
  confirmado idéntico.
- La extrusión de cada losa (`slabBody` → `extrudeProfile` + `tessellateBody`
  de `lib/brep/`) y el mapeo de ejes a escena (`x`, `z→Y`, `y→Z`) en
  `buildSlabGeometry` son, verificado carácter por carácter, la misma
  permutación que `buildCadSolidGeometry` en `solid3d-three.ts` — incluido el
  mismo `try/catch` que deja el grupo vacío con `userData.invalid = true`
  ante un polígono degenerado en vez de tumbar el visor.
- `CadArchitecturalMassHost.sync()` reconcilia por **firma de contenido**
  (`JSON.stringify([polygon, levelZ, height])`), no por identidad de
  referencia, porque una habitación no es una entidad persistida — está
  documentado en el propio archivo y probado: reconstruir el documento con la
  misma geometría no reconstruye ningún objeto THREE; cambiar la altura de un
  muro reconstruye el cuarto **y** el techo que dependía de su cielorraso;
  borrar los muros vacía el grupo.

**Limitación de diseño, no de implementación, documentada en el propio
código y confirmada aquí:** un tabique en T no parte una habitación en dos.
`wall-joins.ts:231` dice explícitamente «el pasante no se toca en esta ola:
romper su cara a la altura de la T pediría un contorno de más de cuatro
vértices» — es una limitación heredada de la maquinaria de uniones (ola 1),
no algo que `roof-floor-generation.ts` intente resolver.

**Techos v1 son sólo losas planas.** El techo de la envolvente exterior es
una losa horizontal que arranca en el cielorraso más alto — no hay soporte
para faldones a un agua, a dos aguas, limatesas ni cubiertas de varios
planos. Es una limitación **a propósito**, dicha en el propio comentario del
módulo («Cubiertas a dos aguas, con limatesas o de varios planos quedan
fuera de esta primera versión a propósito»), no un defecto oculto.

**Evidencia de verificación (ejecutada de nuevo en esta sesión, aislada del
resto del árbol):**

```
$ npx tsx src/lib/cad/roof-floor-generation.spec.ts
roof-floor-generation: paridad con HATCH sobre muros, envolvente por mayor
área y dorado de piso+cielorraso+techo verificados

$ npx tsx src/lib/cad/roof-floor-three.spec.ts
✔ roof-floor-three: teselado de losas al visor y permutación de ejes: 17
aserciones verdes

$ npx tsx src/components/cad/viewport/architectural-mass-host.spec.ts
architectural-mass-host.spec: reconciliación por firma de contenido y dorado
de piso+cielorraso+techo verificados
```

Los tres specs son **Node** (corren bajo `run-specs.mjs`, sin navegador), no
goldens de Playwright: no existe evidencia visual de piso/cielorraso/techo
renderizados, ni puede existir todavía, porque el anfitrión no está montado
en ningún lienzo real (ver el hallazgo de apertura).

## B.2 — Materiales y texturas arquitectónicas

**Archivos nuevos** (sin commitear, completos en el árbol de trabajo):
`apps/web/src/lib/cad/materials/architectural-material-library.ts` (+spec),
`apps/web/src/lib/cad/cad-entity-material-field.ts`,
`apps/web/src/lib/cad/editor-snapshot-material.spec.ts`,
`apps/web/src/components/cad/palettes/CadMaterialPalette.tsx`,
`apps/web/e2e/golden/58-cad-architectural-materials.spec.ts`.
**Archivos modificados**: `asset-archetypes.ts`, `asset-instancing.ts`,
`scene-objects.ts`, `cad-document.ts`, `cad-document-legacy-adapter.ts`,
`editor-snapshot.ts`, `legacy/layout-mapper.ts`.

**Qué hace, verificado:**

- 6 materiales de datos (`wood-oak`, `concrete-smooth`, `brick-red`,
  `glass-clear`, `paint-white`, `paint-blue`) con color base, rugosidad,
  metalicidad y tamaño real de tile en metros. Los tres mapas
  (color/normal/rugosidad) se pintan con un PRNG determinista (`mulberry32`,
  semilla derivada del id — no `Math.random()`), lo que evita que un golden
  visual sea intrínsecamente flaky. Sin URLs externas: todo el patrón
  (madera con vetas, concreto con speckle, ladrillo con aparejo a soga que
  **sí tilea sin costura** — el código pinta un ladrillo de más a cada lado
  del tile a propósito, verificado) se dibuja en `THREE.CanvasTexture`.
- `.repeat` se calcula de `widthM/tileMetersW` — dimensión real de la
  superficie sobre tamaño real del tile — no de un valor fijo.
- Caché por id de los **canvases dibujados** (lo caro), pero cada superficie
  recibe su propia `THREE.CanvasTexture` de envoltura — así `disposeObject()`
  puede liberar la textura de un activo sin invalidar la de otro que use el
  mismo material.
- `cadTexturedAssetMaterial()` vive en la biblioteca y no en
  `asset-archetypes.ts`, con el motivo escrito en el propio código: presión
  de línea sobre ese archivo, y la regla de dirección de imports
  (`lib/` no puede importar de `components/`) impide que la biblioteca
  llame de vuelta a `cadAssetMaterial()`. Sólo el arquetipo `"wall"` la
  consume hoy (`asset-archetypes.ts:251-252`).
- `poolAssetPart()` (`asset-instancing.ts:250`) **rechaza** partes cuyo
  material tenga `.map`/`.normalMap`/`.roughnessMap` — decisión explícita,
  documentada con comentario WHY: el pool comparte un material por clave con
  un único `.repeat`, y dos activos con texturas distintas bajo la misma
  clave se pisarían el mapa. Un muro con textura es grande y poco frecuente;
  paga su propio draw call.
- `materialId` es **aditivo** en toda la cadena: `CadEntityMaterialField`
  (archivo propio, mismo patrón que `CadSchema10DimensionFields`, por el
  mismo tope de 800 líneas de `cad-document.ts`) se mezcla en la entidad
  `box`; `cad-document-legacy-adapter.ts`, `editor-snapshot.ts` y
  `layout-mapper.ts` lo propagan en ambas direcciones. `disposeObject()` en
  `scene-objects.ts` se corrigió para liberar también `normalMap` y
  `roughnessMap` (antes sólo `.map`).
- Panel `CadMaterialPalette.tsx`: props limpias (`materials`,
  `selectedMaterialId`, `onSelect`), sin conocer THREE ni el documento —
  mismo patrón que `CadHatchPalette.tsx`, confirmado comparando ambos
  archivos. **No está importado en `Layout3DEditor.tsx`** (`grep` vacío):
  existe, compila, pero no hay forma de abrirlo haciendo clic en la app hoy.

**Límite de composición no declarado por el propio resumen y que vale la
pena decir aquí:** `materialId` se agregó a la entidad `box` (el sistema de
"activos" heredado — catálogo de muebles/equipo), **no** a `CadWallEntity`
(`type: "wall"`, la entidad que dibuja el comando WALL y la que
`roof-floor-generation.ts` de B.1 lee para construir piso/cielorraso/techo).
`CadWallEntity` no tiene campo `materialId` — verificado en
`cad-entities-v6.ts`. Es decir: hoy se le puede poner ladrillo a un bloque
"wall" del catálogo de mobiliario, pero **no** a un muro dibujado con el
comando WALL, y B.1 y B.2 todavía no comparten la misma noción de "muro".

**Evidencia — golden Playwright real, corrido en esta sesión (no sólo
leído):**

```
$ npx playwright test e2e/golden/58-cad-architectural-materials.spec.ts --project=chromium
  ✓ un muro con material de acabado renderiza sin errores y su materialId
    sobrevive a guardar y reabrir (25.4s)
  1 passed (31.2s)
```

El golden siembra `materialId="brick-red"` directamente en el documento (la
paleta no está cableada, dicho en el propio golden) y comprueba: cero
`pageerror` en el navegador real durante la generación procedural de
texturas, y que `materialId` sobrevive **dos** ciclos completos de
editar→guardar más una recarga real, a través de
`editorSnapshotToCadDocument`/`cadDocumentToEditorSnapshot`. La captura que
tomó el propio golden (`architectural-materials-3d.png`, no versionada —
`e2e/.test-results/` está en `.gitignore`, se regenera corriendo el golden)
muestra los dos muros sembrados con acabado visualmente distinto: uno en
ladrillo rojo, uno gris liso. Se adjunta a este informe.

Specs Node, corridos de nuevo aislados:

```
$ npx tsx src/lib/cad/materials/architectural-material-library.spec.ts
architectural-material-library: catálogo curado y matemática de tiling UV
(dimensión real → repeat) verificados

$ npx tsx src/lib/cad/editor-snapshot-material.spec.ts
editor-snapshot: el material de un activo (box y circle) sobrevive a la
reproyección canónica, igual que su capa, grupo, tags y notas
```

## B.3 — Arquetipos de mobiliario arquitectónico

**Archivos** (commit `1cd0f43`, único; nada fuera de alcance):
extiende `asset-archetypes.ts` (+218 líneas), `asset-catalog.ts` (+101),
`asset-instancing.ts`, `scene-objects.ts`; agrega `asset-archetypes.spec.ts`
(nuevo) y extiende `asset-catalog.spec.ts` y `asset-instancing.spec.ts`.

**Qué hace, verificado:**

- 6 arquetipos nuevos (`stairs`, `railing`, `sofa`, `bed`, `toilet`, `sink`)
  en el switch de `buildCadAssetArchetype()`, construidos sólo con
  `THREE.BoxGeometry`/`THREE.CylinderGeometry` vía `cadAssetPart()` —
  confirmado leyendo el código de cada `case`: nada fuera de ese vocabulario.
- 8 entradas de catálogo nuevas en la categoría **"arquitectura"** ("Arquitectura
  y mobiliario"): Escalera, Baranda, Sofá, Cama, Inodoro, Lavabo, Mueble de
  cocina, Alacena. Las dos de cocina reutilizan el arquetipo `"cabinet"`
  existente (`archetype: "cabinet"` en ambas entradas, confirmado) en vez de
  duplicar geometría, tal como pedía la tarea.
- Verificado contra `check:no-industrial-domain.mjs` en esta sesión — verde,
  «1545 fuentes de producto sin dominio industrial» — ninguno de los 6
  identificadores ni las 8 etiquetas colisiona.
- Por estar en el mismo catálogo (`asset-catalog.ts`) que ya consume
  `Layout3DEditor.tsx` (confirmado por import directo), **los 6 arquetipos
  se pueden colocar hoy mismo** desde el panel «Biblioteca» del editor real
  — a diferencia de B.1, este paquete sí es visible sin trabajo adicional.
- `asset-instancing.spec.ts` extendido confirma que `stairs` y `sofa` entran
  al mismo pool de `InstancedMesh` compartido que `workbench` cuando no
  llevan textura (coherente con el rechazo de `poolAssetPart()` que B.2
  agregó para las partes con mapa).

**Evidencia — spec dedicado, corrido de nuevo, con envolvente real medida
(no sólo "no explota"):**

```
$ npx tsx src/components/cad/viewport/asset-archetypes.spec.ts
asset-archetypes.spec: 60 aserciones ok
```

El spec construye cada uno de los 6 arquetipos con dimensiones reales
(p. ej. `stairs` 1.1×3.6×3.0 m, `sink` 0.55×0.45×0.85 m), calcula la caja
delimitadora real de las mallas devueltas y exige `min.y ≥ -ε` (nada bajo el
piso) y `max.y` dentro de 0.95H–1.3H (alcanza su altura declarada, sin
flotar). El resumen de B.3 menciona haber corregido un hundimiento de ~0.5%
de H en los balaustres de `railing` antes de comitear: **no hay forma de
verificar el estado previo al commit sin deshacer trabajo ya integrado**, así
que esto se toma como declarado; lo que sí se reconfirmó de forma
independiente es que el código **actual** pasa esa aserción exacta
(`box.min.y >= -EPS`) para los 6 arquetipos, balaustres incluidos.

## Verificación al cierre

| Comando / gate | Resultado |
| --- | --- |
| `npm run lint` (repo completo, turbo) | **verde** — 2/2 tareas, **0 errores**; 202 avisos en `web` + 343 en `valle-design-api`, ninguno en los archivos de B.1/B.2/B.3 (confirmado grepeando el log completo por nombre de archivo) |
| `npm run typecheck` (repo completo, turbo) | **verde** — 6/6 tareas (`contracts`, `dwg-codec`, `design-sdk`, `valle-design-api`, `web`) en 19.5 s |
| `check:no-industrial-domain` | verde, 1545 fuentes | 
| `check:no-industrial-domain.spec.mjs` | verde, 113 comprobaciones, 0 residuo |
| `bim-claim-boundary.spec.ts` | verde — ninguna orden, alias, función LISP ni rutina `.lsp` reclama "BIM"; B.1/B.2/B.3 no tocaron `commands/registry.ts` ni ningún alias |
| `check:monolith-budget` | **2 problemas**: `asset-archetypes.ts` (862 líneas, tope 800 — **nuevo, causado por esta campaña**: B.3 sumó 218 líneas y B.2 le sumó la rama de `cadTexturedAssetMaterial`) y `render/pipeline.ts` (906 líneas — preexistente, último tocado por A.1, ajeno a B.1/B.2/B.3) |
| Specs Node nuevos/tocados por esta campaña (8 archivos, corridos aislados) | **verdes**: `roof-floor-generation`, `roof-floor-three`, `architectural-mass-host`, `asset-archetypes`, `architectural-material-library`, `editor-snapshot-material`, `asset-catalog`, `asset-instancing` |
| Specs adyacentes (comparten archivos que B.2 modificó: `cad-document`, `editor-snapshot*`, `asset-scene-host`, `asset-scene-diff`) | **verdes**, 7/7 corridos aislados — sin regresión visible en la plomería compartida |
| Golden Playwright `58-cad-architectural-materials` | **verde**, 1 passed (31.2 s), captura real adjunta |
| Goldens Playwright de B.1/B.3 | **no existen** — sólo hay specs Node; no hay screenshot posible de piso/techo/mobiliario porque el proceso de golden testing nunca corrió sobre ellos |

No se corrió la suite completa de 400 specs Node ni el barrido completo de
goldens Playwright (81+ archivos): la rama tiene otros frentes en curso en
paralelo (0.2, 0.3, A.2, A.5, según la lista de tareas de esta sesión), y las
campañas anteriores dejaron escrito por qué correr goldens con el árbol en
movimiento produce falsos rojos. La verificación aquí es dirigida: los ocho
archivos nuevos/tocados por B.1/B.2/B.3, más los siete específicamente
adyacentes a los cambios compartidos de B.2, más lint y typecheck del
monorepo completo — no una corrida total.

## Limitaciones conocidas

1. **B.1 no está cableado.** `CadArchitecturalMassHost` no se instancia en
   ningún lugar del editor en vivo. Es la limitación más importante de este
   informe (ver apertura).
2. **Techos v1 son sólo losas planas.** Sin soporte para a un agua, a dos
   aguas, limatesas ni múltiples planos — a propósito, declarado en el
   propio código.
3. **Un tabique en T no parte una habitación en dos.** Heredado de
   `wall-joins.ts` (ola 1), no responsabilidad de este módulo.
4. **El picker de materiales no está cableado.** `CadMaterialPalette.tsx`
   existe y compila pero no se importa en `Layout3DEditor.tsx`; hoy
   `materialId` sólo se fija escribiendo el documento, no haciendo clic.
5. **B.1 y B.2 no comparten la misma entidad "muro".** `materialId` vive en
   la entidad `box` (activos/catálogo); `CadWallEntity` (el muro nativo que
   lee B.1) no tiene ese campo. No se puede, hoy, ponerle textura a un muro
   dibujado con el comando WALL.
6. **`asset-archetypes.ts` quedó sobre el presupuesto del monolito** (862 de
   800 líneas) por la suma de B.2+B.3. Ya está señalado por
   `check:monolith-budget` y como tarea pendiente separada; este informe no
   lo remedia porque no era su alcance.
7. **Sin evidencia visual de B.1 ni B.3.** No hay golden de Playwright para
   ninguno de los dos; toda su verificación es a nivel Node (sin navegador,
   sin GPU real). B.2 sí tiene un golden con captura real porque su propio
   autor lo agregó.
8. **B.2 sigue sin commitear.** Al cierre de este informe, sus siete
   archivos compartidos modificados y sus seis archivos nuevos están en el
   árbol de trabajo, no en un commit — visibles en `git status`, no en
   `git log`. Este informe no corrió `git add`/`commit` (fuera de su
   alcance); el orquestador decide cuándo y cómo comitearlo.

## Siguientes pasos

1. **Cablear `CadArchitecturalMassHost` en `Layout3DEditor.tsx`**, con el
   mismo punto del ciclo de vida donde se monta `CadSolidShadeHost`. Es la
   tarea de mayor apalancamiento de todo este frente: convierte meses de
   trabajo ya probado en algo que un usuario puede ver.
2. **Cablear `CadMaterialPalette.tsx`** en el panel de propiedades del
   activo seleccionado, con el `onSelect` escribiendo `Asset.materialId` —
   el propio autor de B.2 dejó el punto de extensión listo y documentado.
3. **Decidir cómo `CadWallEntity` adquiere `materialId`** (¿campo propio en
   `cad-entities-v6.ts`, o B.1 empieza a leer el material desde el muro
   nativo para colorear piso/cielorraso/techo?) — es el paso que hace que
   B.1 y B.2 dejen de ser dos features paralelas y se conviertan en una.
4. **Bajar `asset-archetypes.ts` de 862 a menos de 800 líneas** — partirlo
   siguiendo el mismo criterio que ya usa `architectural-material-library.ts`
   (biblioteca de datos aparte del switch que las consume), antes de que el
   trinquete de monolito bloquee el próximo cambio a ese archivo.
5. **Un golden Playwright para B.1** una vez esté cableado: dibujar cuatro
   muros con el comando WALL, cambiar a 3D, capturar, y confirmar que
   aparecen piso+cielorraso+techo — hoy no puede escribirse porque no hay
   nada que fotografiar.
6. **Un golden Playwright para B.3** que abra la Biblioteca, arrastre
   `stairs` o `sofa` al plano y capture el resultado en 3D — cierra el hueco
   de evidencia visual del paquete que sí está cableado hoy.
7. **Roof v2**: derivar la línea de cumbrera de la topología de muros para
   soportar a dos aguas — diseño nuevo, no una extensión trivial de
   `roof-floor-generation.ts`.
8. **Commitear B.2** (decisión del orquestador, no de este informe) antes de
   que un `git clean`/`reset` en otra sesión se lleve por delante 1099
   líneas de trabajo verificado.
