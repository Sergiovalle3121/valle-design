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
