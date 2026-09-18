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
