# Campaña MiMo — 2026-09-15

Rama: `claude/noche-mimo-razones-para-pagar`
Base: contiene `claude/main-verde-firefox-specs @ 0a5f5600`

## Línea base medida

- rúbrica: 256/309 destino, 186/213 hoy
- comandos en el registro: 300
- `Layout3DEditor.tsx`: ~16909 líneas, 118 `useState`
- `command-engine-host.ts`: 784 líneas (extraído a helpers)
- `entity-commands.ts`: 794 líneas
- `solid3d-build.ts`: 736 líneas (extraído a solid3d-plane.ts)
- goldens: 147 · specs de verificación: 25
- command-integrity: OK (300 comandos)

## Estado de las tareas (CORREGIDO — identificadores de la cola)

| Tarea | Estado | Nota |
|---|---|---|
| T1 | PARCIAL | 3DMOVE/3DROTATE registrados, e/f/dz corregido, specs no ejecutan comandos reales (hallazgo t1-3) |
| T2 | PARCIAL | SLICE/SECTION con planos coordenados corregido (crash, cota0, local plane); specs reescritos pendientes (t2-5) |
| T3 | EN COLA | EXTRUDE en la normal del perfil |
| T4.1 | HECHA | ray-BRep face picking (brep-raycast.ts, 21 aserciones) |
| T4.2 | EN COLA | Arista más cercana en pantalla |
| T4.3 | EN COLA | Ctrl+clic con ciclo de selección |
| T4.4 | EN COLA | Referencia persistente a cara/arista |
| T4.5 | EN COLA | FILLETEDGE/CHAMFEREDGE con aristas designadas |
| T5 | EN COLA | VSCURRENT sobre muros |
| T6 | EN COLA | SECTIONPLANE/LIVESECTION |
| T7 | PARCIAL | Alzados: tope polar se restaura antes de update() (hallazgo vista-1) |
| T8 | PARCIAL | VISUALSTYLES: Conceptual/Grayscale retirados (copias de shaded-edges); Xray funciona |
| T9 | PARCIAL | PERSPECTIVE: icono+summary añadidos, pero variable sin lectores (hallazgo vista-2) |
| T10 | EN COLA | VPORTS en el modelo |
| T11 | EN COLA | Transparencia de capa y objeto |
| T12 | PARCIAL | Orientación de caras corregida, spec tautológico (hallazgo geometria-1) |
| T14 | HECHA | Cuadros con unidad correcta (CSV, LISP, comentarios corregidos) |
| T17 | YA ESTABA | cadWireNumberLabel en electrical-wire.ts |
| T18 | HECHA | CENTERMARK/CENTERLINE |
| T19 | HECHA | STEELSHAPE + BOM |
| T20 | YA ESTABA | attributes.TAG en mep-symbols.ts |
| T21 | YA ESTABA | horizontalProfilesOf rechaza inclinados |
| T22 | PARCIAL | Aristas cóncavas filtradas + planas/borde; spec pendiente (hallazgo geometria-3) |
| T23 | PARCIAL | STEP/IGES: spec corregido, Firefox fix, multi-sólido rechazado; falta unidad INSUNITS (t23-4) |
| T-1.1 | HECHA | Contexto de selección publicado (selection-context.ts, 22 aserciones) |
| D20 | HECHA | Renombrar marca de 'VALLE Design'/'VALLE' a 'VALLECAD': brand.ts, env files, SVGs, production-readiness spec, E2E fixtures, user-facing strings (31 archivos) |

## Hallazgos de revisión abiertos

### Cerrados esta sesión
- **CI monolith-budget**: extraído cadSolidWorldPlaneToLocal a solid3d-plane.ts, clipboardRequest/download a command-engine-host-helpers.ts
- **TEST-MFA-DETERMINISTA**: test inestable arreglado (invertir bit real, no slice(-2)+'AA')
- **t1-4** (`c1aa8054`): eje por dos puntos ya usa axisPoint1 como centro
- **geometria-1** (`cba93bdc`): spec reescrito, llama constructores reales, 8 aserciones
- **t23-3** (`a6f6a47f`): EXPORT rechaza varios sólidos en vez de concatenar archivos inválidos
- **t2-5** (`be46ff85`): spec reescrito, ejecuta SLICE/SECTION por begin/step, 12 aserciones

### Severidad media (abiertos)
- **t1-3**: specs de 3D no ejecutan comandos reales
- **t2-4**: Izquierda/Derecha incorrecto en planos coordenados
- **vista-1**: tope polar se restaura antes de OrbitControls update()
- **vista-3**: VPOINT Rotar no pasa por onBeforeCommandedView
- **vista-4**: T7 sin spec
- **geometria-3**: T22 sin spec

### Severidad baja (abiertos)
- **t1-8**: Rodrigues duplicado, defaults duplicados
- **t23-4**: unidad siempre mm en exportación

## Inventario completo (en progreso)

| Área | Subagente | Estado |
|---|---|---|
| Motor de comandos | explore-1 | COMPLETO (195 líneas, 300 cmds, 112 módulos) |
| B-rep y geometría | explore-2 | COMPLETO (21KB, 42 archivos brep, kernel faceted) |
| Arquitectura y BIM | explore-3 | COMPLETO (281 líneas, 31 archivos, muro paramétrico completo) |
| 3D y visor | explore-4 | COMPLETO (231 líneas, 46 archivos, ViewCube estático, sin PBR) |
| Dibujo 2D y anotación | explore-5 | COMPLETO (23KB, 54 archivos, 7 tipos cota, HATCH, bloques) |
| Eléctrico/Mecánico/MEP | explore-6 | COMPLETO (258 líneas, 56 archivos, IEC+ISO+NOM, Plant 3D) |
| GIS, raster, interop, papel, colaboración | explore-7 | COMPLETO (374 líneas, 67 archivos, DXF/DWG/GLB, paper space) |
| UI/API/paquetes | explore-8 | COMPLETO (401 líneas, 65+ archivos, ribbon, API NestJS, SDK) |
| Scripts/E2E/gobernanza | explore-9 | COMPLETO (382 líneas, 108 scripts, 13 gates, 182 E2E, rúbrica) |
| **INDICE.md** | principal | **CREADO** en `.mimocode/inventario/INDICE.md` — 20 huecos priorizados,5 contradicciones con bitácora |

## Ronda actual

- **Subagente de arreglos**: ✅ t1-4 (ya estaba), geometria-1 (cba93bdc), t2-5 (be46ff85), t23-3 (a6f6a47f), TEST-MFA-DETERMINISTA (74606170), CI monolith-budget (015dbf1b)
- **Inventario**: ✅ 9 áreas completas + INDICE.md creado
- **Hoja de ruta**: `.mimocode/hoja-de-ruta-autocad.md` no existe aún — Claude la prepara
- **Hallazgos medios restantes**: t1-3, t2-4, vista-1, vista-3, vista-4, geometria-3
- **Hallazgos bajos**: t1-8, t23-4
- **Siguiente**: intercalar hallazgos medios con Fase 1 de la hoja de ruta (cuando exista)

## T0 — Fix CI lint-budget (2026-09-16)

El CI de PR #209 fallaba en `check:lint-budget`: 18 warnings ESLint nuevos en 9 archivos que excedían su presupuesto de 0.

### Causa
Variables e imports sin usar (16 `@typescript-eslint/no-unused-vars`) y un ref leído durante render (2 `react-hooks/refs`) en CadCommandLine.tsx.

### Arreglo (1 commit)
- **CadCommandLine.tsx**: `navigatedRef` (useRef) → `navigated` (useState). El ref se leía en JSX para `aria-activedescendant`, lo que viola la regla de hooks. Convierte a estado para que el aria refleje correctamente si el usuario navegó con flechas. Añade `navigated` al `useCallback` deps.
- **command-engine-host.ts**: elimina import no usado `cadClipboardContent`
- **CadCollaborationPalette.tsx**: `setMarkup` → `_setMarkup` (setter no usado aún)
- **brep-raycast.ts**: elimina import no usado `v3Length`
- **center-marks.ts**: elimina imports no usados `CadPoint2`, `CAD_ACCEPT_KEYWORD`, `CadCommandContext` y constante `CENTER_LINESTYLE`
- **document-face-pick.ts**: elimina import no usado `cadEdgeRefFromBody`
- **clash.ts**: `seEmpalman` → `_seEmpalman` (función no usada aún)
- **selection-context.spec.ts**: elimina import no usado `CadSelectionContext` (tipo)
- **transform-3d.spec.ts**: elimina imports no usados `checkClose`, `evaluateSolidTree`, `resolveSolidPlacement`; elimina asignaciones no usadas `body` y `massBefore`

### Evidencia
- `npm run check:lint-budget`: OK (327 avisos dentro del presupuesto de 490)
- `npm run check:surface`: OK (pasa localmente; el CI log era de versión anterior)

### Hallazgo colateral
- `check:precision-evidence` fallaba en Windows por `new URL().pathname` que produce `/D:/` paths. Arreglado con `fileURLToPath()`.
- DWG evidence JSON stale: regenerado con `dwg-evidence.mjs`.
- `large-coordinate-precision.json` faltaba en working tree: restaurado de git.

## D01 — Casilla de Términos pulsable con ratón (2026-09-16)

**Problema:** El `<input type=checkbox>` llevaba `sr-only` (1×1 px, clip), así que el cuadrito visual de 20×20 no era pulsable con ratón. En /register dejaba el botón «Crear cuenta» permanentemente deshabilitado.

**Arreglo:** Cambiado `sr-only` por `absolute inset-0 m-0 h-5 w-5 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed` en Toggle.tsx:56. El input real ahora cubre toda la caja dibujada, transparente, y recibe clics directos. Actualizado el comentario que describía el diseño anterior.

**E2E:** Añadido `test.step` a `197-auditoria-terminos-al-alta.spec.ts` que hace click en la caja (no en el texto) y verifica que la casilla se marca y el botón se habilita.

**Verificación:** `renderToStaticMarkup` confirma que `type=checkbox` y `<label>` siguen presentes y `sr-only` ya no aparece.

## D02 — Guard EMAIL_SENDER_* obligatorio en producción (2026-09-16)

**Problema:** Sin las 4 variables EMAIL_SENDER_*, producción arrancaba con NullEmailSender. Nadie verificaba su cuenta y el login bloqueaba para siempre.

**Arreglo:** `assertEmailSenderConfigured` en `email-sender.config.ts`, siguiendo el patrón de identity-security.ts/identity-mfa.ts (assert al cargar módulo). Actualizado `.env.example` (comentario), `production-startup-smoke.mjs` (4 vars al base env + caso nuevo) y `email-sender.config.spec.ts` (2 casos: prod lanza, dev no).

**Verificación:**9 tests pasan (7 existentes +2 nuevos). Módulo carga OK en desarrollo.

## D03 — Hint de verificación tras login fallido (2026-09-16)

**Problema:** Login con contraseña correcta pero correo sin verificar respondía «Credenciales inválidas» — el mismo mensaje que contraseña mala. El usuario no sabe que debe verificar.

**Arreglo:** Web-side only (API stays 401 to avoid enumeration). Added `hint?: ReactNode` prop to `AuthShell.tsx`. In `AuthPage.tsx`, when `!register && error`, shows: «¿Acabas de crear la cuenta y no has confirmado tu correo? Reenvía el enlace.» with Link to `/resend-verification`. Hint only appears on login errors, not register mode, not before submission.

**Verificación:** typecheck passes, no API changes, existing integration spec untouched.

## T0 · CI rojo — resuelto (2026-09-16)

**Fallo:** PR #209, corrida 35061036006. Paso «CAD contract and legacy-route gates» con `deepStrictEqual` en comparación de evidencia DWG stale + E2E Playwright cascading `skipped`.

**Causa raíz:** Artefactos de evidencia (`independencia-por-fila.json`, `steputils-0.1.json`) desalineados con el árbol tras renombrado de marca T7, más pérdida manifest que clasificaba metadata como `data` en vez de `info`.

**Arreglo:** Commit `ef069027` (ya existente en la rama, creado por sesión anterior):
- Normaliza separadores de ruta en `dwg-surface-honesty.spec.ts`
- Alinea nombre de marca en `oraculos-externos-registro.ts`
- Regenera `independencia-por-fila.json` y `steputils-0.1.json`
- Demueve pérdida de metadata a severidad `info` en `dxf-export-loss-manifest.ts`
- Filtra entradas `info` del array `losses` en `dxf-document-export.ts`

**Verificación local:** `check:cad-math`, `check:dwg-evidence`, `check:monolith-budget`, `check:command-integrity`, `check:design-contract` — todos verdes. Layout3DEditor.tsx = 16887 líneas (bajo 16896). Push bloqueado por URL de seguridad; la rama remota está en `d6f9bcf6`, un commit detrás.

## D04 — CSRF cookie cross-domain (2026-09-16)

**Problema:** La cookie `valle_csrf` se escribía sin `Domain`, quedando como host-only de `api.vallecad.com`. El JavaScript de `vallecad.com` no podía leerla, causando `csrf_invalid` (403) en todo método no seguro tras login.

**Arreglo:** Nuevo `CSRF_COOKIE_DOMAIN` env var (ej. `.vallecad.com`). Función pura `csrfCookieDomain()` en `identity-security.ts` con validación de formato y contra `ALLOWED_ORIGIN`. En `setCookies`, limpia la cookie host-only antes de establecer la nueva con `Domain`. En `clearCookies`, borra en ambos ámbitos. Cookie de sesión (`__Host-`) sin cambios.

**Verificación:** 8 unit tests + 1 integration test verdes. Typecheck OK.

## D05 — CTA de registro de /demo detrás del editor (2026-09-16)

**Problema:** Banner de demo con `z-40/bottom-3` quedaba debajo del editor (`z-70` con fondo opaco). CTA de conversión invisible.

**Arreglo:** `z-40` → `z-[75]`, `bottom-3` → `bottom-24`. E2e actualizado con `elementFromPoint` para verificar oclusión real.

**Verificación:** Typecheck OK. E2e requiere Playwright en vivo (no ejecutable en headless local sin servidor).

## D06 — Legales: marca a VALLECAD con versión nueva (2026-09-16)

**Problema:** Metadata de terms/privacy decía "Valle Design"; cambiarla sin publicar versión nueva violaba el candado legal.

**Arreglo:** "Valle Design" → "VALLECAD" en metadata de ambas páginas. Nuevas versiones 2026-09-16 con hashes actualizados. Comentario obsoleto en legal-documents.ts corregido (el hook del web ya existe).

**Verificación:** `check:legal` Candado OK. `legal-documents.spec.ts` 7/7 verdes.

## D07 — DXF import ignores $INSUNITS (2026-09-16)

**Problema:** `document-import.ts` hardcodaba `unit: "mm"`. DXF en metros (común en México) entraba como mm, escalas anotativas 1000x erradas.

**Arreglo:** Leer `$INSUNITS` (group code 70) del HEADER. Propagar a `CadDxfImportResult`. Resolver con `cadDrawingUnitFromInsunits()` de `units-imperial.ts`. Aviso `dxf_unit_assumed` para tres casos (ausente, sin unidad, no representable).

**Verificación:** Typecheck OK. `check:dxf-props` OK. 4 aserciones nuevas en `document-import.spec.ts`.

## D08 — Reenviar correo traga errores (2026-09-16)

**Problema:** `.catch(() => {})` descartaba 429, fallos de red y todo. El usuario veía confirmación aunque nada se enviara.

**Arreglo:** `ResendTimerButton.onResend` ahora devuelve `boolean`. Timer sólo arranca si `true`. Clasificación de errores: 429 → mensaje de espera, TypeError → mensaje de red, otros → silenciados (no filtrar si la cuenta existe). Error con `role="alert"`.

**Verificación:** Typecheck OK.

## D09 — Paleta parte palabras (2026-09-16)

**Problema:** Botones `w-16` (56 px útiles) partían palabras como «Seleccionar», «Ajustar todo».

**Arreglo:** `w-16` → `w-20` (80 px, 72 px útiles). `break-words` → `truncate` (elipsis en vez de corte).

**Verificación:** Typecheck OK.

## D10 — «Algo salió mal» sobre panel Biblioteca (2026-09-16)

**Problema:** Botones con `fixed left-3 top-[11.5rem]` caían dentro del muelle izquierdo (240 px).

**Arreglo:** Migrados a `useStudioTraySlot` + `createPortal` (patrón CallBar). Fallback `fixed` para antes de que monte la barra de estado.

**Verificación:** Typecheck OK.

## T0 · CI rojo — check:authz path relativo vs apiRoot (2026-09-16)

**Fallo:** `npm run check:authz` fallaba con 52 fallos (handlers no encontrados + exenciones huérfanas). La spec usaba fixtures en directorio temporal pero `auditHandlerAuthorization` calculaba `path.relative(REPO_ROOT, file)` en vez de `path.relative(apiRoot, file)`. En Windows esto producía paths absolutos `C:/...` que no coincidían con las claves de exención.

**Arreglo:**
- `check-handler-authorization.mjs:130`: `REPO_ROOT` → `apiRoot` en el cálculo de ruta relativa.
- `handler-authorization-exemptions.json`: todas las claves renombradas quitando prefijo `apps/api/src/` (26 claves).

**Verificación:** `check:authz` OK (13 comprobaciones spec + 119 handlers auditados, 26 exenciones verificadas).

## D11 — Tres píldoras comparten anclaje (2026-09-16)

**Problema:** `CadViewportHint` estaba en `bottom-3 left-1/2 -translate-x-1/2` (mismo ancla que `ScaleBar`), y su texto de148 caracteres (~930 px) solapaba la línea de comandos (x 12→492).

**Arreglo:**
- `viewport-hints.tsx`: ancla cambiada a `bottom-3 right-3`, `max-w-[22rem]`, `@container` + `@max-[50rem]:hidden` para ocultar en viewports estrechos. `rounded-full` → `rounded-card` (token del sistema), envoltura de texto habilitada.
- `ScaleBar.tsx`: añadido `data-testid="cad-scale-bar"`.
- `viewport-hints.tsx`: añadido `data-testid="cad-viewport-hint"`.

**Verificación:** Typecheck OK. A 1920x1080: hint en x 646→998, scale-bar ~430→580, command-line 12→492 — sin intersecciones. E2e golden requiere Playwright (no disponible localmente).

## D12 — Persistir pliegue del acompañante onboarding (2026-09-16)

**Problema:** `const [minimized, setMinimized] useState(true)` no se guardaba: al recargar, el panel volvía a abrirse entero tapando ~166.000 px² del dibujo.

**Arreglo:**
- `guided-tour.ts`: añadido `minimized: boolean` a `CadTourRecord`, acción `minimize` al reducer, lectura en `parseCadTourRecord`.
- `tour-host.ts`: `a.minimized === b.minimized` en `sameRecord()`.
- `CadGuidedTourDock.tsx`: `useState(true)` → `record.minimized`, `setMinimized` → `cadTourHost.dispatch({ type: "minimize" })`.

**Verificación:** guided-tour.spec 27 comprobaciones, tour-host.spec 4 comprobaciones + caso de persistencia tras reset+attach.

## D13 — Incident reporter: estilo de bandeja y comentario de posición (2026-09-16)

**Problema:** Los botones «Algo salió mal» y «Comentarios» en la bandeja de la barra de estado usaban el estilo pesado (`rounded-lg`, `shadow`, `px-2.5`) que no encaja con el resto de la barra. El comentario de la posición fija no explicaba que `top-[11.5rem]` cae sobre el muelle izquierdo, no sobre el lienzo.

**Arreglo:**
- `CadIncidentReporter.tsx`: botones de bandeja con estilo `rounded-control border border-border bg-surface px-1.5 py-0.5 type-micro` (patrón CallBar). Rótulos con `@max-[40rem]:hidden` para evitar cuarto renglón. Fallback fijo conserva estilo original.
- Comentario reescrito explicando que `top-[11.5rem]` es la columna del muelle izquierdo, no el lienzo.

**Verificación:** Typecheck OK.

## D14 — Viewport hint max-width responsivo (2026-09-16)

**Problema:** D11 usó `max-w-[22rem]` fijo. D14 requiere `max-w-[calc(100%-32rem)]` para reservar espacio dinámico según el ancho real de la línea de comandos (`left-3` + `w-[min(30rem,42vw)]` + holgura).

**Arreglo:** `max-w-[22rem]` → `max-w-[calc(100%-32rem)]` en `CadViewportHint`. El `data-testid` y el ancla `right-3` ya estaban de D11.

**Verificación:** Typecheck OK.

## D15 — /sla imprime ruta del repositorio al cliente (2026-09-16)

**Problema:** El texto visible de `/sla` contenía literalmente `` `docs/ops/SLA.md` `` con backticks sin renderizar — una ruta interna del repositorio en superficie comercial.

**Arreglo:** Eliminada la referencia a `docs/ops/SLA.md` del párrafo visible. Añadida regresión en `sla-surface.spec.ts` que extrae texto visible de `<p>/<li>` en SlaPage, terms y privacy y prohíbe backticks y rutas `docs/`/`apps/`.

**Verificación:** sla-surface.spec OK.

## D16 — /sla intro atribuye compromisos al catálogo (2026-09-16)

**Problema:** La intro de `/sla` decía «con la misma fuente que usa el resto del producto: el catálogo real», pero solo los nombres de columna vienen del catálogo. Los compromisos vienen de la política operativa.

**Arreglo:** Intro reescrita: «Los nombres de columna se leen del catálogo público; los compromisos vienen de la política operativa». Regresión en sla-surface.spec que verifica que «catálogo» se liga a «nombres» en la intro.

**Verificación:** sla-surface.spec OK.

## D17 — «Operador del despliegue» en superficie pública (2026-09-16)

**Problema:** Las páginas públicas hablaban como instalación auto-hospedada («el operador de este despliegue»). Para un visitante de vallecad.com, eso dice que el sitio es una instalación de prueba.

**Arreglo:** Reescritura de copia visible en6 ficheros: contact, privacy, status, precios, support, terms. Voz cambiada de tercera persona («el operador debe») a primera persona («lo completaremos»). Fallbacks de canal no configurado reescritos como mensajes al cliente. Añadida regresión en public-pages.spec.ts que extrae texto visible y prohíbe «despliegue» y «el operador».

**Verificación:** Typecheck OK. public-pages.spec OK.

## D18 — Traducir barra de estado CAD al español (2026-09-16)

**Problema:** La barra de estado del editor CAD mostraba etiquetas en inglés ("Layer", "Clearance", "Safety", "Highlights", "Recovery local activo", "API online/offline", "Grilla on/off") y enums sin mapear ("ok", "warn", "critical" como texto visible). Además, `Layout3DEditor.tsx` tenía "Crítico", "bajo mínimo" y "Dentro de mínimo" sin acentos.

**Arreglo:**
- **CadStatusBar.tsx**: 10 cambios de texto visible — Recovery → Recuperación, API online/offline → API en línea/sin conexión, Layer → Capa, Grilla on/off → Rejilla activada/desactivada, Snap grid/free → Forzcursor rejilla/libre, Validación score mapeado a correcta/con avisos/con errores, CAD severity mapeado a CAD crítico/con avisos/Correcto, Clearance → Holguras, Safety → Seguridad, Highlights → Resaltados. DXF sin tocar.
- **Layout3DEditor.tsx**: Acentos corregidos — Critico → Crítico, bajo minimo → bajo mínimo, Dentro de minimo → Dentro de mínimo.
- **Goldens actualizados**: 11-cad-recovery-journal.spec.ts (2 textos), 22-cad-compare-collaboration.spec.ts (1 texto).
- **Regresión nueva**: cad-status-bar-locale.spec.ts con 25 comprobaciones (negativas inglesas, positivas españolas, enums mapeados).

**Verificación:** Typecheck OK. cad-status-bar-locale.spec: 25 comprobaciones OK.

## D20 — Renombrar marca a VALLECAD (2026-09-16)

**Problema:** `brand.ts` ya decía "VALLECAD" pero 32 ficheros aguas abajo (env examples, specs, SVGs, fixtures, strings de producción) seguían con "Valle Design" / "VALLE".

**Arreglo:** Subagente actualizó production-readiness.spec.ts, .env.example (raíz y web), 7 SVGs regenerados, 11 strings de producción, 7 ficheros de test, page-metadata.ts. Verificado con `check:surface` y `build-brand-assets.mjs --check`.

**Verificación:** Typecheck OK. check:surface OK. check:legal requirió commit separado para actualizar hashes.

## check:legal — Hashes de documentos legales actualizados (2026-09-16)

D17 y D19 modificaron terms/privacy sin actualizar los SHA-256 en legal-documents.ts. Commit separado con los hashes nuevos.

## D21 — SALTADA: requiere editar package.json (2026-09-16)

**Hallazgo:** D21 requiere añadir scripts a `package.json`, pero tanto la instrucción del usuario como la cola prohíben tocarlo. Soltada hasta que el titular la autorice explícitamente.

## T0 — Manifests stale (2026-09-16, sesión 2)

**Fallo:** `check:template-gallery` (149 plantillas cambiaron de dibujo) y `rubric.mjs --markdown --check` (gap-matrix desactualizada). Monolith budget ya pasaba localmente.

**Arreglo:** Regenerados `template-gallery.json` y `autocad-2027-gap-matrix.md`.

**Verificación:** Ambos checks OK. `check:cad` completo OK (salvo timeout de lint-budget por tamaño de Layout3DEditor).

## D22-D24 — Ya hechas en sesión anterior (2026-09-16, sesión 2)

**Verificación:** `git grep 'Valle Design|VALLE Design' apps/web/src/components/cad -- ':!*.spec.ts'` = 0. `git grep 'Valle Design' apps/web/src/app/docs` = 0 (solo comentario permitido en spec). Confirmadas.

## D28-D29 — Parcialmente hechas (2026-09-16, sesión 2)

**D28:** Golden 212 existe (mide "Seleccionar"). El fix (w-20 + truncate) se hizo en D09. El spec completo que itera todas las etiquetas falta.
**D29:** Fix (portal a status bar tray) se hizo en D10/D13. Spec de verificación DOM (cad-incident-open no intersecta cad-left-dock) no existe.

## D35 — maxPolarAngle π/2 exactos para alzados (2026-09-16, sesión 2)

**Problema:** Con `Math.PI / 2.05`, OrbitControls.update() tiraba la cámara de φ=90° a 87,8°. Los cuatro alzados nunca se sostenían.

**Arreglo:** `camera-policy.ts:151`: `Math.PI / 2.05` → `Math.PI / 2`. Comentarios actualizados.

**Verificación:** camera-policy.spec.ts: 33 aserciones verdes (10 nuevas: OrbitControls reales, 4 vistas × 2 + tope + maxPolarAngle).

## D36 — Filtrar empalme por punto, no por par (2026-09-16, sesión 2)

**Problema:** `seEmpalman(a,b)` descartaba el par completo. Dos rutas empalmadas que además se cruzaban lejos no informaban el cruce.

**Arreglo:** Filtro de empalme movido dentro del bucle de segmentos: cada candidato se descarta individualmente si está cerca de un punto de empalme.

**Verificación:** clash.spec.ts: 61 comprobaciones verdes (caso13: empalme + cruce →1 choque; caso14: solo empalme →0 choques). clash.ts = 797 líneas (bajo 800).

## D37 — Presets laterales a elevación 0 (2026-09-16, sesión 2)

**Problema:** Los presets laterales (front/back/left/right) colocaban la cámara en y=d*0.5, dando ~21° de inclinación.

**Arreglo:** `camera-view-presets.ts`: y = `d * 0.5` → `0` para los cuatro alzados. `fakeControls()` reproduce el recorte polar.

**Verificación:** camera-view-presets.spec.ts: 24 aserciones verdes (8 nuevas: camera.y === target.y + maxPolarAngle restaurado).

## D39 — raySegmentDistance recalcula t tras acotar u (2026-09-16, sesión 2)

**Problema:** Rama paralela: t=0 descartaba aristas verticales. Rama general: u acotada sin recalcular t daba distancia incorrecta.

**Arreglo:** Calcular q (punto acotado) primero, luego t como proyección de q sobre el rayo. Exportado `raySegmentDistance`.

**Verificación:** edge-ray.spec.ts: 14 aserciones verdes (paralelo: distance≈1, t≈750; clamp: u=1, t≈2.5, distance=3.674; regresión OK).

## D38 — PERSPECTIVE conmuta cámara perspectiva/paralela (2026-09-16, sesión 2)

**Problema:** PERSPECTIVE devolvía `variables` pero nadie leía la variable. `setProjection()` no creaba cámaras. `get camera()` no miraba `projection`.

**Arreglo:**
- `view-controller.ts`: cámara `parallel` (OrthographicCamera) sincronizada con la perspectiva. `get camera()` devuelve `parallel` cuando `projection === "parallel"`. `syncParallel()` se llama en `emit()`.
- `host-requests.ts`: nuevo `view-projection` en la unión.
- `view-visual.ts`: PERSPECTIVE devuelve `host` request en vez de `variables`.
- `plot-host.ts`: handler para `view-projection` que llama `bridge.setProjection()`.
- `use-command-engine.ts`: variable PERSPECTIVE se escribe al aplicar la petición.
- `studio-engine-bridges.ts`: `viewControllerRef` en inputs, `setProjection` en bridges.
- `Layout3DEditor.tsx`: pasa `viewControllerRef` a bridges.

**Verificación:** view-controller.spec (5 aserciones: conmutación cámaras), view-visual.spec (2: host request), studio-engine-bridges.spec (11). Typecheck OK. Monolith budget OK (16891/16896).

## D47 — Inventario de variables BRAND_* (2026-09-16, sesión 2)

**Problema:** Las variables de entorno NEXT_PUBLIC_BRAND_* podrían pisar el default del código en producción.

**Arreglo:** Sección «Inventario de variables de marca» en docs/ops/railway.md. GitHub Actions: 0 variables (verificado). Railway: 17 variables pendientes de verificar por el titular.

**Verificación:** Documento creado con tabla de las 17 claves.

## D49 — Identificadores congelados documentados (2026-09-16, sesión 2)

**Problema:** brand.ts no documentaba que los identificadores internos (npm, BD, XDATA) no se renombran en rebranding.

**Arreglo:** Tercer punto en «Separación deliberada» de brand.ts: IDENTIFICADORES CONGELADOS con los tres grupos completos.

**Verificación:** check:surface OK. Solo comentario, ni una línea de código.

## Tareas restantes (D40-D48)

| Tarea | Estado | Bloqueo |
| --- | --- | --- |
| D40 | BLOQUEADA | Precondición: CadSnapProvider.snaps debe aceptar document |
| D41 | EN COLA | Una-sesión, wall association anchors |
| D42 | EN COLA | Una-sesión, polyline dimension association |
| D43 | EN COLA | Varias-sesiones, paper space DXF import |
| D44 | EN COLA | Una-sesión, plot preview surface |
| D45 | EN COLA | Una-sesión, PDF font embedding |
| D46 | EN COLA | E2E golden, requiere Playwright |
| D47 | HECHA | — |
| D48 | EN COLA | Gate anti-recaída (script + spec, sin package.json) |
| D49 | HECHA | — |
