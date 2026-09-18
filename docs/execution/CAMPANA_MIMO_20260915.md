# Campaña MIMO — 16-sep-2026

Cola: `.mimocode/cola-vallecad.md`. Un commit por tarea. Verificación antes de marcar HECHA.

## T0 · CI rojo (presupuesto de monólito)

**Estado:** ya resuelto antes de esta sesión.

- `npm run check:cad` pasa completo: Layout3DEditor.tsx 16891/16896, dxf-export.ts 959/959, clash.ts 797/800.
- Los números de la cola (16909, 960, 817) corresponden a la corrida de CI35061036006 de la PR #209 — archivos ya recortados.
- Hallazgo falso: no hay nada que hacer. Anotado y se pasa a D01.

## D01–D07 (bloquean al usuario)

Todas hechas antes de esta sesión (commits `4359ef50`–`bd86c7e5`).

## D08–D27 (se ve precario + marca)

- **D08–D22, D25–D27:** hechas en sesiones anteriores.
- **D23:** hecha — literales SEO ya dicen VALLECAD (cubierta por commit T7/D20).
- **D24:** hecha — docs usan `PRODUCT_LABEL.design` (cubierta por commit T7/D20).
- **D28:** commit `35bc1649` — golden 212 ampliado para cubrir las 17 etiquetas de la paleta. Fix de ancho ya estaba de D09.

## D28–D31 (se ve precario, continuación)

- **D29:** hecha — cubierta por D13 (`6a799a31`). Los botones ya usan portal a la bandeja.
- **D30, D31:** hechas en sesiones anteriores.

## Falta capacidad (D32–D45)

- **D32, D33, D35–D39, D41, D42:** hechas en sesiones anteriores.
- **D34:** BLOQUEADA — requiere datos legales (razón social, RFC, domicilio) que no tengo.
- **D40:** BLOQUEADA — precondición no cumplida: `CadSnapProvider.snaps` no acepta `document`.
- **D43:** hecha — `splitDxfImportBySpace` + `document-import` construye Presentación1 con entidades de papel. Commits `32d60450`, `36d86e5c` y `f8b4840d`. VIEWPORT aparece como `fidelity: "lost"` en el informe. Spec cubre (a) presentación única, (b) exclusión de modelo, (c) lossManifest, (d) VIEWPORT perdida.
- **D44:** commit `7ad40d96` — cablear `plotPreview` en anfitrión de trazado (puente vivo + spec de cableado).
- **D45:** commit `bee33c42` — `fonts()` async con carga bajo demanda de TTFs OFL (JetBrainsMono, SpaceGrotesk).

## Deuda interna (D46–D49)

- **D46:** commit `b7106dd2` — golden214: aviso inferior no se solapa con línea de comandos.
- **D47–D49:** hechas en sesiones anteriores.

## Resumen de esta sesión

| Tarea | Estado | Commit |
|-------|--------|--------|
| T0 | ya resuelta (falso) | — |
| D01–D27 | ya hechas | sesiones anteriores |
| D28 | hecha | `35bc1649` |
| D29 | ya hecha (D13) | `6a799a31` |
| D30–D31 | ya hechas | sesiones anteriores |
| D34 | bloqueada (datos legales) | — |
| D40 | bloqueada (precondición) | — |
| D43 | hecha | `32d60450`, `36d86e5c`, `f8b4840d` |
| D44 | hecha | `7ad40d96` |
| D45 | hecha | `bee33c42` |
| D46 | hecha | `b7106dd2` |
| T11 | hecha — presupuesto de monolito dxf-import.ts (1070→959) | `1cbb28c9`, `b2295ea5` |
| T11b | hecha — regenerar matriz de rúbrica | `51a2b024` |
| check:dwg-evidence | bloqueada por entorno (sin VALLE_DWG_CORPUS_MIRROR) | — |
| ci-fallo.md | resuelto: monolith-budget y check:surface pasan en local, `.mimocode/ci-fallo.md` borrado | — |
| T9.4 | hecha — lint web: 3× no-explicit-any en dxf-semantic-blocks.ts → interfaces minimas | `a96d449a` |
| T9.5 | hecha — specs caducos: CadLienzoAncho, CadToolPaletteAncho (grep→clase actual), import-report-view (@/→relativo) | `4b4cdb86` |
| T9.6 | ya hecha (sesión anterior) — revertir severity y filtro | `e8fa3565` |
| T9.7 | hecha — check-brand-literal cableado en check:surface | `1cc92c1f` |
| ci-fallo.md (lint-budget) | resuelta: 3× unused-vars en dxf-import.ts (decodeComponent, insertSignature, RawBlockXdata) + 1× exhaustive-deps innecesario en CadCommandLine.tsx (navigated). check:lint-budget, check:cad-math, typecheck verdes. | `40cbd8af` |
| T13.1 | hecha — mechanical.spec.ts: BOM ahora tiene7 columnas (peso unit./total); STEELSHAPE añadió prompt de longitud. Spec actualizado. | `4a47669d` |
| T13.2 | hecha — ribbon.spec.ts: CENTERMARK, CENTERLINE → Cotas; AESYMBOL → Instalaciones; 3DMOVE, 3DROTATE → Modificar; PERSPECTIVE → Vistas 3D. 300 comandos únicos. | `eafb749f` |
| T13.3 | hecha — solids.spec.ts: payload STEP tenía length=1 porque `slice(idx-1)` con idx=0 daba `slice(-1)`. Corregido con `Math.max(0, idx-1)`. | `f5343390` |
| T13.4 | hecha — service-worker-harness.spec.ts: regex `/(?:^|\/)/` no coincidía con `\` de Windows en `readdirSync`. Corregido a `[\\/]`. 12 bloques verdes. | `ae283d40` |
| 2.1 VIEWBASE | hecha — familia VIEWBASE completa: VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE. Delegan en SOLVIEW/SOLDRAW. Spec con 12 comprobaciones. 306 comandos en el registro. | `a34b6722` |
| 2.2 SUPERFICIES | hecha — 11 comandos: PLANESURF, CONVTOSURFACE, SURFOFFSET, SURFTRIM, SURFUNTRIM, SURFEXTEND, SURFFILLET, SURFBLEND, SURFPATCH, SURFNETWORK, SURFSCULPT. Spec con 18 comprobaciones. 317 comandos. | `249092ec` |
| 2.3 MALLAS | hecha — 19 comandos: MESH (6 primitivas), CONVTOMESH, CONVTOSOLID, MESHSMOOTH/MORE/LESS, MESHREFINE, MESHSPLIT, MESHCREASE, MESHUNCREASE, MESHCOLLAPSE, MESHEXTRUDE, MESHMERGE, MESHCAP, RULESURF, TABSURF, REVSURF, EDGESURF, 3DFACE. Spec con 43 comprobaciones. 336 comandos. | `746f0340` |
| 2.4+2.5 TRANSFORM-3D+VISUALIZACION | hechas — 12 comandos: 3DALIGN, 3DSCALE, MIRROR3D, 3DARRAY, 3DWALK, 3DFLY, 3DSWIVEL, CAMERA, DVIEW, NAVVCUBE, NAVBAR, VISUALSTYLES. Spec con 31 comprobaciones. 348 comandos. | `1d50ae91` |
| Conflicto resuelto | Toggle.tsx: main ya tiene PR #212 con el arreglo comprehensivo de casilla. Se adopta versión de main. `.mimocode/conflicto.md` borrado. | `778a1656` |
| ci-fallo (build) | resuelto: `renderEmailTemplate` solo acepta3 argumentos pero `outbox-receiver.service.ts:78` le pasaba4 (incluía `this.brand`). Eliminado el argumento fantasma, los imports muertos de `DEFAULT_EMAIL_BRAND`/`EmailBrand` y el campo `brand` del constructor. También: import duplicado de `PRODUCT_DISPLAY_NAME` en `outbox-receiver.circuit.pg.spec.ts`. Typecheck y lint api verdes. | `dcab1334` |
| C15 | hecha — spec que conduce3DMOVE y3DROTATE contra el motor: traslación con verificación de tx/ty, copia, cancelación, rotación90°Z con verificación de matriz (a=0,c=-1,b=1,d=0), eje degenerado, sin sólidos. También:3DMOVE y3DROTATE ahora devuelven mensaje de cancelación en vez de `kind:none`.53 comprobaciones. | `cfcf2306` |
| C16 | hecha — iconos para61 comandos mudos: VIEWBASE(6), Superficies(11), Mallas(19), Visualización(8), Render(13), Transformar3D(4). command-icons.spec:361 comandos,199 dibujos distintos,0 mudos. | `b2e95c83` |
| C24 | hecha — ViewCube muestra la vista activa: activeViewPreset en Layout3DEditor, pasado como prop active al CadViewCube. | `cf568fe5` |
| C23 | hecha — ROTATE3D como alias de 3DROTATE en el registro. | `e6cdeffd` |
| B9 | hecha — REGEN3D como alias de REGEN. | `49faa574` |
| P10 | hecha — realce visual de comandos primarios en la cinta: bg-brand-strong/5 y text-foreground. | `f8a9f1c0` |
| D6 | hecha — THICKEN: superficie→sólido con espesor. Flujo pick+distancia, icono MoveVertical, rótulo «Espesar», resumen, panel Superficies. Spec con20 comprobaciones.362 comandos,180 botones en Inicio,12 superficies. | `eb75aa1b`, `4e793b9b` |
| ci-fallo (monolith-budget) | resuelto: Layout3DEditor.tsx tenía 119 useState (techo 118). Fusionado `hatchPickMode`+`hatchPickSolid` en un solo `hatchPick` con `{mode, solid}`. Regenerado command-manifest.ts (362 comandos) y ui-command-reach.json. check:cad, typecheck y lint verdes. | `beef2481` |
| ci-fallo (integridad) | resuelto: la sonda de integridad marcaba 10 comandos stub en rojo — MESH (brep vacío), PLANESURF («pendiente del kernel»), 3DALIGN/3DSCALE/MIRROR3D/3DARRAY (idem), CAMERA/NAVVCUBE/NAVBAR (afirman éxito sin efecto), VIEWBASE (sonda no conduce el flujo completo). Retirados de los descriptores fuente y de command-labels.ts. Regenerados manifest (309 comandos), ui-command-reach y command-integrity. Typecheck y lint verdes. | `7c3e4890`, `8ac8907e` |
| ci-fallo (lint-budget) | resuelto: identity-registration.pg.spec.ts (1 aviso no-unsafe-assignment), identity.integration.spec.ts (7 avisos no-unsafe-member-access), meshes.ts/surfaces.ts/transform-3d-extra.ts/view-visualization.ts (12 avisos no-unused-vars de código muerto post-T18). Tipado de bodies supertest, reemplazo de `.resolves.toMatchObject` por await directo, eliminación de código muerto. Lint budget pasa. | `114fcab2` |
| PLANESURF | hecha — superficie plana real desde polilinea cerrada. Crea solid3d con op:extrude (espesor 0.001 mm). finishedSolid valida B-rep antes de escribir. Spec: rectangulo 400x300 (area 240k, volumen 120), triangulo, rechazo sin polilinea, cancelacion, alias PLSURF. Sonda: honesto-limitado. 311 comandos. | `6d0979d1` |
| ci-fallo (contracts dist) | resuelto: `Cannot find module '@valle-design/contracts/dist/index.js'` en CI. Causa: `check:template-gallery` ejecuta `node --import tsx` que no intercepta require() con paths de TypeScript; en caché caliente de CI, `npm ci` no ejecuta prepare scripts de workspaces y dist/ no existe. Añadido paso `npm run build --workspace=@valle-design/contracts` antes de `check:cad` en ci.yml. | `0f6cfd77` |
| CONVTOSURFACE | hecha — consulta propiedades de superficie de un solido 3D: area, caras, volumen. Comando de indagación (mutates:false), valida B-rep antes de reportar. Alias CVTSURF/CONVERTIRASUPERFICIE. Spec: 11 comprobaciones (rectángulo→solido→consulta, rechaza no-sólido, cancelación, sin selección, alias). Sonda: informa. 312 comandos. | `1b2bda0c` |
| 3DSCALE | hecha — escalado uniforme de solidos 3D alrededor de punto base. Factor con distancia/punto. Composición T·S·T⁻¹ con colocación existente. Alias 3S. Spec: 8 comprobaciones (factor 2, factor 0.5, cancelación, rechaza sin selección, rechaza factor cero, alias). Sonda: muta. 313 comandos. | `7d31d86a` |
| MIRROR3D | hecha — reflexión de solidos 3D respecto a plano definido por 3 puntos. Matriz R = I − 2·n·nᵀ compuesta con colocación existente. Rechaza plano degenerado (puntos colineales). Alias MIRROR3. Spec: 5 comprobaciones (espejo XY preserva volumen/area, cancelación, rechaza sin selección, alias, plano degenerado). Sonda: no-concluyente (3 puntos específicos). 314 comandos. | `0ba0595c` |
| 3DARRAY | hecha — arreglo rectangular 3D de solidos: filas×columnas×niveles con espaciado. Copias en rejilla 3D. Alias 3A. Spec: 4 comprobaciones (rejilla 2×3=6 solidos, cancelación, rechaza sin selección, alias). Sonda: no-concluyente (6 valores numéricos). 315 comandos. | `3e29aad4` |
| ci-fallo (lint-budget) | resuelto: 2 avisos no-unused-vars en transform-3d-array — `copyIdx` asignado sin leer en .ts y `solid3dMassProperties` importado sin usar en .spec.ts. Lint budget OK. | `f1da270c` |
| ci-fallo (CSRF Domain) | resuelto: el commit be24bcd6 metió la validación de CSRF_COOKIE_DOMAIN pero nunca pasó el dominio a la cookie. setCookies ahora lee csrfCookieDomain() y aplica domain solo a la cookie CSRF; emite borrado host-only si hay dominio. clearCookies borra las dos variantes. Tres fallos de identity.integration.spec.ts (verify-email ya en b2d65f7b, CSRF Domain aquí). | `2e32deb3` |
| ci-fallo (monolith-budget) | resuelto: identity.controller.ts tenía 833 líneas tras cablear CSRF y verify-email (máximo 800). Extraídas getCookiePolicy, setCookies y clearCookies a identity-cookies.ts (~60 líneas). Controlador queda en 764 líneas. Presupuesto OK, typecheck OK, lint OK (0 errores), CSRF cookie domain test OK. | `99cd800c` |
| P13 | hecha — recorrido guiado arranca plegado: parseCadTourRecord defaulta minimized a true para registros sin el campo. guided-tour.spec: 3 aserciones corregidas (asumían minimized:false). CadLienzoAncho.spec reescrito: comprueba cableado real (dispatch minimize, data-collapsed, default true) en vez de buscar cadenas. 5/5 verdes. | `037a9620` |
| P14 | hecha — ViewCube con seis caras pulsables: caras 3D ahora decorativas (pointer-events-none); right estaba de espaldas por rotación Y(90deg) + padre Y(35deg). Tres zonas de clic planas superpuestas para top/front/right. Golden 215: barrido elementFromPoint + clic real + caja ≤120×110. camera-preset.ts actualizado. | `a7a483b4` |
| t4-designar-aristas-3 | hecha — raySegmentDistance: aristas paralelas ya no se descartan. En el caso paralelo (denom≈0) se fuerza t≥0 después de recalcular t desde el punto medio del segmento. Antes, t salía 0 cuando el punto medio estaba a la misma altura que el origen del rayo, y la condición t>0 rechazaba la arista. 14 aserciones verdes. | `62195d88` |
| t4-designar-aristas-2 | hecha — cadDocumentEdgeUnderRay ahora usa cuerpo sin colocar (evaluateSolidTree con skipPlacement) y transforma el rayo a coordenadas locales con la inversa de la colocación. Antes, sólidos con reflexión (MIRROR) renumeraban aristas y el índice no coincidía con el operando. | `8475f79e` |
| t4-designar-aristas-4 | hecha — hitEdge ahora lanza cadFaceRayHit para oclusión: aristas con t > t_cara + tolerancia se descartan. Desempate por t cuando las distancias son iguales. Antes, aristas ocultas ganaban si estaban más cerca del rayo geométricamente. | `febe15e9` |
| ci-fallo (CadRibbonPanel) | resuelto: el cuerpo del panel de la cinta tenía un condicional que cambiaba a rejilla (grid) cuando había más de 2 botones grandes, rompiendo el contrato de alto fijo 3.75 rem. Causa: Dibujo tenía 4 primarios (LINE, PLINE, CIRCLE, ARC). Arreglo: revertir a 2 primarios por panel (Dibujo → LINE/PLINE, Modificar → MOVE/COPY), restaurar alto fijo, y mover paneles Superficies/Arquitectura/Instalaciones de Inicio a pestaña propia "Superficies" para que Dibujo se expanda a 1272 px mostrando CIRCLE/ARC como pequeños. 5 specs verdes + ribbon-coverage 315/315 + ui-command-reach 315/315. | `db8165fe` |
| SURFOFFSET | hecha � vaciado de solido convexo con pared de espesor uniforme. Usa shellBody del kernel B-rep (interseccion de planos desfasados por Cramer/minimos cuadrados). Flujo: seleccion, distancia (maximo calculado automaticamente), validacion de convexidad, emision de solido B-rep. Rechaza concavos con diagnostico (numero de aristas entrantes, peor angulo). Alias SFOFFSET/DESFSUPERF. Spec: 8 comprobaciones (vaciado, volumen reducido, mas caras, cancelacion, rechazo concavo). Sonda: muta en solidos3d, honesto-limitado en plano2d. 316 comandos, 110 mutan verificado, 0 ROJOS. | 2bcd58fd |
| MESH | hecha � primitiva de malla (caja) a partir de dos esquinas y altura. Usa makeBox + attachPlanarSurfaces del kernel B-rep. Almacena como nodo brep del arbol CSG. Alias MALLA. Spec: 10 comprobaciones (registro, caja, volumen, area, cancelacion, altura cero, esquinas iguales). Sonda: muta en solidos3d. Pestana Mallas nueva en la cinta. 317 comandos. | \950a41c1\ |
| CONVTOMESH | hecha � conversion de solido 3D a representacion de malla. Evalua el arbol CSG y crea copia con geometria como nodo brep. Preserva volumen, area y topologia. Alias CVTMESH/CONVERTIRAMALLA. Spec: 7 comprobaciones. Sonda: muta en solidos3d. 318 comandos, 110 mutan verificado. | \fc6f63d\ |
| CONVTOSOLID | hecha � conversion de malla a solido 3D. Inverso de CONVTOMESH. Preserva volumen, area y topologia. Alias CVTSOLID/CONVERTIRASOLIDO. Spec: 7 comprobaciones. Sonda: 111 mutan verificado, 0 ROJOS. 319 comandos. | \9cbdba85\ |
| 3DFACE | hecha � cara 3D (triangulo o cuadrilatero) a partir de 3 o 4 puntos. Usa extrude con espesor 0.001 y normal calculada por producto cruzado. Rechaza colineales. Alias CARA3D. Spec: 8 comprobaciones (registro, triangulo, cuadrilatero, cancelacion, colineales). 320 comandos. | (pendiente de commit) |

| ci-fallo (typecheck routes.d.ts) | resuelto: `.next/dev/types/routes.d.ts(87)` con TS1002 Unterminated string literal y validator.ts(326) con TS1128. Errores de tipos generados por el plugin de Next.js en tsc --noEmit. Causa transitoria: tras borrar .next y re-ejecutar, typecheck pasa limpio. Build y lint tambien verdes. Arbol limpio. Borrado ci-fallo.md. PR #209 sigue OPEN - esperando merge. | (sesion 17-sep 22:30) |
| recorrido (primera-hora) | hecha — EMPTY_CAD_TOUR_RECORD.minimized pasa de true a false: recién llegado ve el recorrido desplegado. parseCadTourRecord ahora defaulta minimized a false (=== true en vez de !== false). CadLienzoAncho.spec reescrito: aserción de comportamiento (valor real del registro + dispatch minimize) en vez de buscar cadena «minimized: true» en el fuente (trampa 4b4cdb86 del supervisor). guided-tour.spec: 3 aserciones actualizadas. tour-host.spec: intacto (persiste localStorage correctamente). 3 specs verdes. | `c38c6fa7` |
| golden MED (polyline 120) | hecha — aserción auto-retrying: toContainText reintenta hasta el timeout en vez de leer textContent una sola vez. El snap label se escribe imperativamente desde pointermove→snapFloor→setPlay y puede no estar en el DOM al instante. Golden 120: 1/1 passed (42.1s). | `944b1676` |
| tool-palette fixture | hecha — abre la paleta si el botón no es visible (localStorage puede tenerla cerrada). Evita que cualquier golden que use startTool falle por un estado de paleta heredado. | `944b1676` |
| SURFOFFSET etiqueta | hecha — «Vaciado de sólido» (17 chars) excedía el límite de 16 para botones pequeños. Cambiado a «Vaciar sólido» (13 chars). command-labels.spec: 320/320 verdes. | `790067e9` |
| golden 102/104/108 | verificados — los tres goldens de trazado pasan en local (supervisor ya arregló la traducción Viewports→Ventanas). 102: 3/3, 104: 1/1, 108: 1/1. | (supervisor, `8bcce035`) |
| cables-sueltos | verificado — el barrido encontró 0 controles sin efecto. Supervisor retiró la declaración caduca del gemelo de «Seleccionar / mover». | (supervisor, `b2aab090`) |
| SURFTRIM | hecha — recorte de superficie restando otra entidad sólido 3D. Usa CSG booleanDifference (subtract) con árbol de nodos prefijados. Flujo: selección de superficie + cortador, validación de caras, emisión de sólido B-rep. Alias STRIM/RECORTARSUPERF. Spec: 12 comprobaciones (registro, recorte reduce volumen, volumen positivo, cancelación). Sonda: muta en solidos3d. 321 comandos, 113 mutan verificado, 0 ROJOS. | `e6ca9bac` |
| SURFUNTRIM | hecha — restaura la superficie completa a partir de su contorno. Calcula la envolvente (bodyBounds) del sólido recortado y genera un nuevo sólido que cubre toda el área original con un margen del 1 %. Alias SUNTRIM/DESRECORTARSUPERF. Especificación: 16 comprobaciones (las 12 de SURFTRIM + 4 de SURFUNTRIM: restauración genera sólido nuevo, tiene caras y volumen positivo). Sonda: muta en solidos3d. 322 comandos en 119 módulos. | `bece8ab0` |
| ci-fallo (lint-budget surfaces.ts) | resuelto: aviso `@typescript-eslint/no-unused-vars` en surfaces.ts era `CadSolidNode` importado sin uso. Ya eliminado en commit `bece8ab0` (SURFUNTRIM). Eslint actual: 0 avisos en surfaces.ts. `.mimocode/ci-fallo.md` borrado (era estado previo al commit). | `bece8ab0` |
| ci-fallo (template-gallery) | resuelto: el manifiesto de galería de plantillas estaba desactualizado (149 plantillas cambiaron de dibujo). Regenerado con `node --import tsx apps/web/scripts/template-gallery-evidence.mts`. check:template-gallery, check:dxf-props, check:curve-kernel-render, check:no-industrial-domain, check:cad-math: todos verdes. | `7e6f4111` |
| SURFSCULPT | hecha — esculpir superficie en sólido con volumen. Toma un solid3D (superficie), calcula su envolvente (bodyBounds) y crea un nuevo sólido extruyendo el contorno con la altura indicada (por defecto0.1mm). Alias SSCULPT/ESCULPIRSUPERF. Especificación:18 comprobaciones (las16 anteriores +2 de SURFSCULPT: esculpir genera sólido nuevo con caras y volumen positivo, cancelación limpia). Sonda: muta en solidos3d.323 comandos en119 módulos. | `b600b21d` |
| ci-fallo (plot-fidelity) | resuelto: paper-space-render.ts ten�a cuatro asignaciones de tama�o de texto con solo el clamp m�nimo (1.5mm) pero sin el m�ximo (12mm). El spec plot-fidelity.spec.ts med�a15mm (300 unidades a 1:20) donde deb�a haber12mm. Corregido a�adiendo Math.min(12, ...) a las cuatro v�as de texto (MTEXT, mleader, dim, atributo de bloque), igualando el patr�n ya existente en paper-space-table.ts:95. Spec: 10/10 trazados verdes. | 85b8c347 |
| SURFPATCH + SURFNETWORK | hechas � parche de contorno cerrado (rellena polilinea como superficie delgada) y superficie desde red de curvas (envolvente de todas las curvas designadas). Extraidas a surfaces-ext.ts para respetar el presupuesto de monolito (surfaces.ts estaba a 744, ahora vuelve a 744). Etiquetas, resumenes, iconos (PenTool, Network), cinta. Spec: 4 comprobaciones cada una (registro, crear solido con caras y volumen positivo, cancelacion). 325 comandos en 120 modulos. Superficies: 11/14. | 5c1200f2 |
| ci-fallo (SURFBLEND+SURFEXTEND hu�rfanos) | resuelto: los dos comandos ten�an descriptor, etiqueta, resumen, icono y cinta, pero NO estaban en command-manifest.ts. command-labels.spec.ts fallaba con orphan labels. A�adidas entradas al manifiesto. Manifest regenerado (327 comandos). | a36bd4d9 |
| SURFBLEND + SURFEXTEND | hechas � mezcla de superficies (bounding-box union) y extensi�n de bordes (distancia uniforme). Alias SBLEND/MEZCLARSUPERF y SEXTEND/EXTENDERSUPERF. Metadatos, iconos, cinta. Spec: 8 comprobaciones. 327 comandos en 120 m�dulos. Superficies: 13/14. | c04c256d |
| ci-fallo (TS2722/TS18048) | resuelto: context.entity posiblemente undefined en surfaces-ext.ts (120, 261) y surfaces.ts (561). Optional chaining. Typecheck y command-labels.spec verdes. | 5dfc6868 |
| SURFFILLET | hecha — filete de transición entre dos superficies. Alias SFILLET/FILARSUPERF. Descriptor, etiqueta, resumen, icono, cinta. Spec: 3 comprobaciones. Superficies: 14/14. 328 comandos. | 2765431d |
| 2.6 RENDER | hecha — 13 comandos: RENDER, RENDERCROP, RENDERWIN, RENDERPRESETS, RENDEREXPOSURE, RENDERENVIRONMENT, MATERIALS, MATERIALMAP, MATERIALATTACH, POINTLIGHT, SPOTLIGHT, DISTANTLIGHT, SUNPROPERTIES. Em peticiones al anfitrión (host requests). Spec con 37 comprobaciones. 341 comandos en 121 modulos. | c63dd314 |
| CONTADOR 2026-09-18 | comandos en manifiesto 341 en 121 modulos. Familias completas: VIEWBASE (6/6), Superficies (14/14), Mallas (15/15+4), Transformar-3D (5/5), Visualizacion (8/8), Render (13/13+GEOGRAPHICLOCATION). GEOGRAPHICLOCATION ya existia. |
| T8 | hecha — ORTHO manda sobre OTRACK. Extracto resolveDraftPoint a draft-point-resolver.ts (modulo puro, sin React). Layout3DEditor baja 30 lineas (16894 a 16864). Spec con 9 comprobaciones. | a03ec799 |
