# Inventario: UI del estudio, API y Paquetes

> Generado el 2026-09-17. Lectura READ-ONLY del arbol completo.

---

## 1. UI del estudio — Cinta (Ribbon)

### 1.1 Archivos encontrados

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `apps/web/src/components/cad/ribbon/CadRibbon.tsx` | 181 | Componente raiz de la cinta |
| `apps/web/src/components/cad/ribbon/CadRibbonPanel.tsx` | 48 | Panel individual dentro de una pestana |
| `apps/web/src/components/cad/ribbon/CadRibbonButton.tsx` | 61 | Boton individual de la cinta |
| `apps/web/src/components/cad/ribbon/command-icons.ts` | 553 | Mapa de 175 iconos por comando (lucide) |
| `apps/web/src/components/cad/ribbon/ribbon-icons.ts` | 103 | Icono por PANEL (fallback) |
| `apps/web/src/components/cad/ribbon/ribbon-icons.spec.ts` | — | Gate: todo panel tiene icono |
| `apps/web/src/components/cad/ribbon/command-icons.spec.ts` | — | Gate: todo comando tiene icono |
| `apps/web/src/components/cad/ribbon/CadRibbon.spec.ts` | — | Tests del componente |
| `apps/web/src/components/cad/ribbon/CadRibbonPanel.spec.ts` | — | Tests del panel |
| `apps/web/src/lib/cad/ribbon.ts` | 350 | Generador de la cinta a partir del registro |
| `apps/web/src/lib/cad/ribbon-order.ts` | 95 | Declaracion explicita de orden (paneles, botones) |
| `apps/web/src/lib/cad/ribbon.spec.ts` | — | Cobertura total del registro en pestanas |
| `apps/web/src/lib/cad/ribbon-golden.spec.ts` | — | Goldens de la cinta |

### 1.2 Estado real

- **7 pestanas** declaradas: Inicio, Insertar, Anotar, Parametrico, Vista, Salida, Administrar (`ribbon.ts:63-71`).
- La cinta es una **funcion total** sobre el registro de comandos (`ribbon.ts:1-35`). Un comando nuevo aparece automaticamente en su pestana.
- **Clasificacion en dos pasos**: (1) patron del nombre canonico (regex anclados, `ribbon.ts:91-100`), (2) fallback al `kind` del descriptor (`CAD_KIND_TAB`, `ribbon.ts:74-81`).
- **Orden declarado** en `ribbon-order.ts`, no alfabetico. LINE es el primer boton de "Dibujo", MOVE el primero de "Modificar".
- **LocalStorage** persiste pestana activa y estado colapsado (`CadRibbon.tsx:17-18`). Lazy init en `useState`, sin efecto de sincronizacion.
- **Solo lectura** deshabilita comandos mutables boton por boton (`CadRibbon.tsx:109-113`), no la cinta entera.
- Accesibilidad: `role="group"` + `aria-labelledby` en paneles (`CadRibbonPanel.tsx:27-28`). NO es `role="toolbar"` porque falta la navegacion por flechas.
- Un boton de la cinta despacha por el **mismo camino** que la linea de comandos (`CadRibbonButton.tsx:13-14`).

### 1.3 Huecos vs AutoCAD

| Hueco | Detalle |
|-------|---------|
| Sin navegacion por flechas en paneles | WAI-ARIA exige roving tabindex para `role="toolbar"`; declarado como pendiente (`CadRibbonPanel.tsx:22`) |
| Sin panel de propiedades contextual | AutoCAD muestra propiedades del seleccionado en el panel inferior de la cinta |
| Sin tooltips enriquecidos | Solo texto plano con `title`; AutoCAD muestra miniaturas y descripciones |
| Sin cinta contextual | AutoCAD cambia la cinta al seleccionar un bloque o una referencia externa |

### 1.4 Redundancias y deudas

- `ribbon-icons.ts` (icono por panel) y `command-icons.ts` (icono por comando) coexisten. El primero es fallback: si un comando nuevo no tiene entrada en `command-icons`, cae al icono del panel (`CadRibbonButton.tsx:33`). El gate `command-icons.spec.ts` impide que eso ocurra en CI.

---

## 2. UI del estudio — Linea de comandos

### 2.1 Archivos encontrados

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `apps/web/src/components/cad/command-line/CadCommandLine.tsx` | 372 | Componente presentacional |
| `apps/web/src/components/cad/command-line/CadCommandLineDock.tsx` | 77 | Conecta presentacion con motor |
| `apps/web/src/components/cad/command-line/command-engine-host.ts` | 784 | Anfitrón del motor (estado fuera de React) |
| `apps/web/src/components/cad/command-line/command-engine-host-helpers.ts` | — | Clipboard y descarga |
| `apps/web/src/components/cad/command-line/command-engine-host-download.ts` | — | Descarga de archivos |
| `apps/web/src/components/cad/command-line/use-command-engine.ts` | 664 | Hooks de React (useSyncExternalStore) |
| `apps/web/src/components/cad/command-line/studio-context.ts` | 147 | Traduce editor a contexto del motor |
| `apps/web/src/components/cad/command-line/studio-engine-bridges.ts` | — | Puentes adicionales |
| `apps/web/src/components/cad/command-line/navigation-host.ts` | — | Anfitrón de navegación (ZOOM, VIEW) |
| `apps/web/src/components/cad/command-line/plot-host.ts` | — | Anfitrón de trazado (PLOT, PUBLISH) |
| `apps/web/src/components/cad/command-line/session-catalogs.ts` | — | Catálogos de sesión (filtros, estados) |
| `apps/web/src/components/cad/command-line/dxf-host.ts` | — | DXFOUT/DXFIN |
| `apps/web/src/components/cad/command-line/etransmit-host.ts` | — | ETRANSMIT |
| `apps/web/src/components/cad/command-line/data-extraction-host.ts` | — | DATAEXTRACTION |
| `apps/web/src/components/cad/command-line/xref-host.ts` | — | XATTACH/XREF |
| `apps/web/src/components/cad/command-line/ucs-plan-host.ts` | — | UCS/PLAN |
| `apps/web/src/components/cad/command-line/sheet-set-host.ts` | — | SHEETSET/PUBLISH |
| `apps/web/src/components/cad/command-line/history-host.ts` | — | U/UNDO/REDO |
| `apps/web/src/components/cad/command-line/plot-host.spec.ts` | — | Tests de trazado |
| `apps/web/src/components/cad/command-line/command-engine-host.spec.ts` | — | Tests del anfitrión |
| + 8 archivos .spec.ts adicionales | — | Tests de hosts individuales |

### 2.2 Estado real

- **Motor de comandos**: reductor puro (`lib/cad/engine/command-engine.ts`, 513 lineas). Sin React, sin THREE, sin CadDocument.
- **Anfitrión**: clase imperativa (`CadCommandEngineHost`, 784 lineas) con `useSyncExternalStore`. Estado fuera de React para respetar el presupuesto de `useState` del monolito.
- **300 comandos** en el manifiesto (`command-manifest.ts`). Metadata estatica; implementacion llega por `import()` (lazy).
- **Carga a demanda**: `dispatch` encola si la implementacion no esta lista (`command-engine-host.ts:612-648`). `warmCommands` precalienta para scripts.
- **Comandos transparentes**: `'ZOOM` dentro de LINE suspende y reanuda (pila de hasta 4, `command-engine.ts:135`).
- **Autocompletado**: sugerencias en la linea de comandos reutilizan el MISMO registro que Ctrl+K (`CadCommandLine.tsx:37-39`).
- **Historial**: 60 renglones max, con `id` estable para evitar remontes de React (`CadCommandLine.tsx:57`).
- **F2** abre el dialogo para releer con lector de pantalla (`CadCommandLine.tsx:133-145`).
- **Espacio/Enter con caja vacia** repite ultimo comando (`CadCommandLine.tsx:193-204`).
- **Grabador de acciones**: ACTRECORD/ACTSTOP/ACTMANAGER en el anfitrión (`command-engine-host.ts:170-525`). Macros en memoria de sesion.
- **Punto de modificación** (DESDE/M2P/TT): sesion de coleccion de puntos antes de pasar al comando (`command-engine.ts:60-75`).
- **SCU inclinado**: comandos no espaciales rechazan puntos en plano inclinado (`command-engine.ts:440-464`).

### 2.3 Huecos vs AutoCAD

| Hueco | Detalle |
|-------|---------|
| Sin Dynamic Input (tooltip bajo el cursor) | AutoCAD muestra coordenadas/distancia/opciones junto al cursor |
| Sin barra de opciones dinamica | Las opciones del paso activo solo aparecen en la linea de comandos |
| PAR necesita arista de referencia | Marcado como pendiente (`command-engine.ts:353-366`) |

### 2.4 Redundancias y deudas

- El `use-command-engine.ts` (664 linees) es el archivo mas denso del area: 6 hooks y el wiring completo del estudio. No viola el monolito pero es candidato a descomposicion.
- Los hosts de XREF, DXF, ETRANSMIT, DATA EXTRACTION, HISTORY, UCS, SHEET SET y PLOT estan ya separados en archivos propios, lo cual es buena arquitectura.

---

## 3. UI del estudio — Paletas (Ctrl+K, Tool Palettes)

### 3.1 Archivos encontrados

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `apps/web/src/lib/cad/command-palette.ts` | 107 | Entradas de Ctrl+K (union de registros) |
| `apps/web/src/lib/cad/command-palette.spec.ts` | — | Gate: no vuelven las entradas "Frase" |
| `apps/web/src/lib/cad/tool-palettes.ts` | 201 | Paletas de herramientas (TOOLPALETTES) |

### 3.2 Estado real

- **Ctrl+K** indexa los comandos del motor V2 + herramientas de barra + biblioteca de simbolos (`command-palette.ts:45-76`). Las entradas "Frase" del parser de lenguaje natural se retiraron (`command-palette.ts:13-24`).
- **Busqueda** con scoring: prefijo exacto (3), contiene en nombre (2), contiene en texto completo (1) (`command-palette.ts:93-99`).
- **Tool Palettes**: persistencia en localStorage, clave por `tenant:user`. Paletas de fabrica: Dibujo, Modificacion, Consulta. Cada herramienta ejecuta por la MISMA puerta que la linea de comandos (`tool-palettes.ts:54-56`).
- **`CadToolPaletteCatalog`**: clase con CRUD + persistencia opcional (`tool-palettes.ts:170-201`).

### 3.3 Huecos vs AutoCAD

| Hueco | Detalle |
|-------|---------|
| Sin paletas personalizadas por usuario en servidor | Solo localStorage (se pierde al cambiar de navegador) |
| Sin paletas de bloque | AutoCAD genera paletas automaticamente desde bloques del dibujo |
| Sin paleta de propiedades | El panel flotante de propiedades de AutoCAD no existe |

---

## 4. UI del estudio — Motor de comandos

### 4.1 Archivos encontrados

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `apps/web/src/lib/cad/engine/command-engine.ts` | 513 | Reductor puro del motor |
| `apps/web/src/lib/cad/engine/command-manifest.ts` | 340 | Metadata de 300 comandos (generado) |
| `apps/web/src/lib/cad/engine/command-types.ts` | — | Tipos del motor |
| `apps/web/src/lib/cad/engine/command-summaries.ts` | 349 | Resúmenes en español (fail-closed) |
| `apps/web/src/lib/cad/engine/command-summaries.spec.ts` | — | Gate: todo comando tiene resumen |

### 4.2 Estado real

- **300 comandos** en el manifiesto (`command-manifest.ts`). Los resúmenes en español cubren todos (`command-summaries.ts`).
- **6 tipos de comando**: draw, modify, annotate, inquiry, view, manage.
- **Efectos**: prompt, preview, execute, view, host, message, variables, ui, selection, osnapOverride, cursor, idle.
- **Acciones**: token (texto), input (puntero/enter/cancel), invoke (directo), repeat (espacio).

---

## 5. UI del estudio — i18n y Locale

### 5.1 Archivos encontrados

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `apps/web/src/i18n/config.ts` | 56 | Locales soportados: en, es |
| `apps/web/src/i18n/locale.ts` | 47 | Server Actions para cookie de idioma |
| `apps/web/src/i18n/request.ts` | — | Resolucion de mensajes por peticion |
| `apps/web/src/i18n/coverage.ts` | — | Cobertura de traducciones |
| `apps/web/src/i18n/coverage.spec.ts` | — | Gate de cobertura |
| `apps/web/src/i18n/coverage-superficie.ts` | — | Superficie de cobertura |
| `apps/web/src/i18n/route-language.ts` | — | Idioma por ruta |
| `apps/web/src/i18n/catalog-contract.spec.ts` | — | Gate: catalogo de mensajes |
| `apps/web/src/i18n/key-driven-copy.spec.ts` | — | Gate: copia guiada por claves |
| `apps/web/src/lib/cad/locale-es-mx.spec.ts` | 98 | Gate: formato mexicano de numeros/fechas |
| `apps/web/src/lib/cad/regions.ts` | 254 | REGION (contornos -> superficies) |

### 5.2 Estado real

- **Locales**: `"en"` (default) y `"es"`. Cookie `valle_locale`, con respaldo de `axos_locale` (legacy).
- **Estrategia**: next-intl SIN routing por segmento `[locale]`. Idioma en cookie legible por SSR.
- **Locale BCP-47**: `en-US` para ingles, `es-MX` para espanol (`config.ts:48-51`).
- **Formato mexicano**: `formatMagnitude` usa separadores mexicanos (coma para millares, punto para decimales). Verificado por `locale-es-mx.spec.ts`.
- **Fechas**: `toLocaleDateString("es-MX")` produce dia/mes/anio, no el orden americano. Verificado.
- **Cobertura**: hay gate de cobertura de traducciones (`coverage.spec.ts`).
- **No hay `next-intl` config completa** visible: los mensajes viven en archivos separados consultados por `request.ts`.

### 5.3 Huecos vs AutoCAD

| Hueco | Detalle |
|-------|---------|
| Sin soporte de idioma completo para comandos | Los nombres de comandos son siempre en ingles (LINE, TRIM); solo los alias son en español (GRABARACCION para ACTRECORD) |
| Sin formato de unidades por locale | El motor usa es-MX para magnitudes, pero las unidades de dibujo (mm, m, ft, in) son independientes del idioma |

---

## 6. UI del estudio — Sistema de diseño (components/ui)

### 6.1 Archivos encontrados

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `apps/web/src/components/ui/index.ts` | 63 | Punto unico de importacion |
| `apps/web/src/components/ui/styles.ts` | 184 | Vocabulario compartido (tokens, clases) |
| `apps/web/src/components/ui/Button.tsx` | 98 | Boton unico (4 variantes, 3 tamanos) |
| `apps/web/src/components/ui/Card.tsx` | — | Card, CardHeader, Surface |
| `apps/web/src/components/ui/Modal.tsx` | 215 | Dialogo modal accesible |
| `apps/web/src/components/ui/Input.tsx` | — | Input, Select, Textarea |
| `apps/web/src/components/ui/Field.tsx` | — | FieldShell, controlClass |
| `apps/web/src/components/ui/Toggle.tsx` | — | Checkbox, Switch |
| `apps/web/src/components/ui/Tabs.tsx` | 157 | Pestanas con WAI-ARIA |
| `apps/web/src/components/ui/Feedback.tsx` | — | Badge, Tooltip, Skeleton, ProgressBar |
| `apps/web/src/components/ui/EmptyState.tsx` | — | Estado vacio |
| `apps/web/src/components/ui/Spinner.tsx` | — | Indicador de carga |
| `apps/web/src/components/ui/PasswordField.tsx` | — | Campo de contrasena |
| `apps/web/src/components/ui/QrCode.tsx` | — | Codigo QR |
| `apps/web/src/components/ui/LanguageSwitcher.tsx` | — | Selector EN/ES |
| `apps/web/src/components/ui/ErrorBoundary.tsx` | — | Limite de error |
| `apps/web/src/components/ui/design-system.spec.ts` | 212 | Gate: 7 reglas del sistema |
| `apps/web/src/components/ui/primitives-contract.spec.ts` | — | Gate: contrato de primitivas |
| `apps/web/src/components/ui/foco-visible.spec.ts` | — | Gate: foco visible |
| `apps/web/src/components/ui/foco-visible-budget.json` | — | Presupuesto de foco |
| `apps/web/src/components/ui/error-boundary.spec.ts` | — | Tests del limite de error |

### 6.2 Estado real — Reglas del sistema (design-system.spec.ts)

7 reglas verificadas en CI:

1. **Ningun tamano fuera de la escala** (linea 43-58): prohibido `text-[Npx]`.
2. **Piso de 11 px** (linea 65-79): el escalon mas pequeno >= 11px.
3. **La marca no cambia de color** (linea 86-95): prohibido `cyan-*`, `sky-*`, `teal-*`.
4. **Ningun hex en componente** (linea 102-121): `components/ui/` y `components/brand/` sin colores resueltos.
5. **El sistema se consume** (linea 128-151): tokens como `bg-card`, `border-border`, `text-muted-foreground` tienen uso > 0.
6. **Una sola puerta a las primitivas** (linea 158-182): 15 primitivas obligatorias en el barrel.
7. **La marca no se desincroniza** (linea 188-208): `logo-geometry.ts` alimenta al menos 3 consumidores.

### 6.3 Vocabulario de estilos (styles.ts)

- **`cx()`**: union de clases (linea 15-19).
- **`focusRing`**: anillo de foco unico (linea 32-33).
- **`touchTarget`**: `min-h-11` (44px) para superficies publicas (linea 43).
- **`motionBase`**: transicion del sistema (linea 60-61).
- **3 elevaciones**: resting, elevated, floating (linea 78-83).
- **3 radios**: control, card, surface (linea 91-96).
- **4 variantes de boton**: primary, secondary, ghost, danger (linea 124-137).
- **3 tamanos de boton**: sm, md, lg (linea 151-155).
- **`buttonClass()`**: misma piel para `<a>` y `<button>` (linea 164-184).

### 6.4 Accesibilidad (Modal.tsx como ejemplo)

- Foco atrapado (Tab circula dentro, linea 108-131).
- Foco devuelto al cerrar (linea 151-152).
- Scroll bloqueado (linea 139).
- Escape cierra (linea 103-107).
- Portal a `<body>` (linea 157).
- `onClose` en ref para evitar remontes (linea 96-99).

### 6.5 Huecos vs AutoCAD

| Hueco | Detalle |
|-------|---------|
| Sin sistema de temas avanzado | Solo claro/oscuro basico; AutoCAD permite temas personalizados |
| Sin soporte de High-DPI explicito | Los tokens usan rem; DPI alto depende del navegador |

---

## 7. API (apps/api/)

### 7.1 Modulos encontrados (15)

| Modulo | Archivos clave | Funcion |
|--------|---------------|---------|
| **identity** | controller, service, mfa, export, rate-limit (24 archivos) | Registro, login, MFA, exportacion GDPR, rate limiting |
| **organizations** | controller, access service, permissions, memberships (10 archivos) | CRUD de organizaciones, roles (owner/admin/member/viewer) |
| **cad-documents** | service, storage, validation, entities, blocks, invariants (48 archivos) | Documentos CAD, versiones, bloques, invariantes de sólidos/aberturas |
| **cad** | controller, repository, presence, review, sheet-sets, dxf-export (37 archivos) | Superficie HTTP `/v1/cad/*`, presencia en tiempo real, revision, conjuntos de planos |
| **commercial** | billing, stripe, outbox, CFDI, plans, trials (65+ archivos) | Facturacion, Stripe, CFDI mexicano, planes, trials, webhooks |
| **auth** | module, guards (cad-auth, permissions), decorators (8 archivos) | Guards globales: CadAuthGuard + PermissionsGuard |
| **messaging** | controller, service, event bus, entities (9 archivos) | Canales de mensajeria |
| **calls** | controller, service, ICE config, room store (11 archivos) | Llamadas/WebRTC |
| **blob-store** | s3-blob, design-blob, migration, aws-signature (8 archivos) | Almacenamiento de blobs (S3 y PostgreSQL) |
| **audit-log** | service, controller, retention, entity (7 archivos) | Registro de auditoria con retencion |
| **feedback** | controller, service, product-operators, entity (10 archivos) | Feedback de usuarios, operadores de producto |
| **legal** | controller, documents, acceptances, entity (6 archivos) | Documentos legales, aceptaciones |
| **support** | controller, service, incident DTOs (7 archivos) | Soporte e incidentes |
| **outbox-receiver** | controller, service, signature, email-templates (14 archivos) | Receptor de outbox con verificacion HMAC |
| **education** | education-mode (2 archivos) | Modo universitario (dominios institucionales) |

### 7.2 Estado real

- **Framework**: NestJS con TypeORM, PostgreSQL.
- **Guards globales** (`app.module.ts:78-79`): `CadAuthGuard` (sesion first-party) + `PermissionsGuard` (entitlement `design.cad` + RBAC `cad:*`).
- **CORS**: origenes configurables, credentials, headers CSFR y X-Review-Token.
- **Seguridad**: helmet (CSP `default-src 'none'`), bodyParser limit 8MB, validation whitelist+transform+forbidNonWhitelisted.
- **Observabilidad**: metricas HTTP (Prometheus), error reporting (Sentry), metricas comerciales y de activacion.
- **Outbox**: worker con leases, retry/backoff, dead-letter. Webhooks con firma HMAC (`timestamp.rawBody`), verificacion en tiempo constante.
- **Apagado ordenado**: `installGracefulShutdown` con drenaje y techo.
- **Modo universitario**: bandera por dominios institucionales.
- **CFDI**: facturacion electronica mexicana via Facturama.
- **Rate limiting**: atomico en PostgreSQL (`postgres-identity-rate-limit.store.ts`).
- **Review links**: tokens para compartir documentos en modo lectura.

### 7.3 Huecos vs API tipica de CAD

| Hueco | Detalle |
|-------|---------|
| Sin GraphQL | Solo REST (OpenAPI YAML como fuente de verdad) |
| Sin WebSocket nativo para presencia | Usa SSE para presencia en tiempo real |
| Sin soporte multi-region | Un solo PostgreSQL, un solo S3 |

### 7.4 Redundancias y deudas

- `cad-documents` y `cad` son dos modulos separados con frontera difusa: `cad-documents` tiene la logica de dominio (entidades, invariantes, validacion) y `cad` tiene la superficie HTTP. La separacion es correcta pero la convencion de nombres no es evidente.
- El modulo `commercial` (65+ archivos) es el mas grande del API. Contiene billing, Stripe, CFDI, outbox, planes, trials y webhooks. Candidato a descomposicion interna.

---

## 8. Paquetes (packages/*)

### 8.1 `@valle-design/contracts` (packages/contracts)

| Archivo | Funcion |
|---------|---------|
| `src/index.ts` | Re-exporta: product-catalog, brand, design-contracts, dxf-xdata-apps, legacy |
| `src/design-contracts.ts` (302 lineas) | Tipos minimos: IDs tipados, versiones CAS, permisos `cad:*`, errores, limites |
| `src/product-catalog.ts` | Capacidades del producto |
| `src/brand.ts` | Identidad de marca |
| `src/dxf-xdata-apps.ts` | XDATA de DXF |
| `src/legacy/` | Identificadores legacy (AXOS-CAD-STUDIO, UNIVERSAL) |
| `specs/` | YAML OpenAPI fuente (`design-api.v1.yaml`, `design-events.v1.yaml`) |

**Estado**: Sin dependencias runtime. Solo tipos y constantes. `private: true`, `UNLICENSED`.

### 8.2 `@valle/design-sdk` (packages/design-sdk)

| Archivo | Funcion |
|---------|---------|
| `src/client.ts` | Cliente HTTP para la API |
| `src/identity.ts` | Endpoints de identidad |
| `src/commercial.ts` | Endpoints comerciales |
| `src/presence.ts` | Endpoints de presencia |
| `src/calls.ts` | Endpoints de llamadas |
| `src/messaging.ts` | Endpoints de mensajeria |
| `src/generated/design-api.ts` | Generado por openapi-typescript |
| `src/compat.spec.ts` | Tests de compatibilidad |

**Estado**: SDK TypeScript oficial. Generado desde OpenAPI. Dependencia de `@valle-design/contracts`. `private: true`, `UNLICENSED`.

### 8.3 `@valle-design/dwg-codec` (packages/dwg-codec)

| Archivo | Funcion |
|---------|---------|
| `AGENTS.md` | Reglas scoped del laboratorio DWG |
| `CLEAN_ROOM_POLICY.md` | Politica de clean-room |
| `SOURCE_REGISTER.json` | Registro de fuentes consultadas |
| `CAPABILITIES.md` | Capacidades declaradas con evidencia |
| `THREAT_MODEL.md` | Modelo de amenazas |
| `src/` | Implementacion del codec |
| `tests/` | Unitarios y adversariales |
| `fixtures/` | Fixtures sinteticos con SHA-256 |
| `fuzz/` | Smoke de fuzzing |
| `benchmarks/` | Benchmarks |

**Estado**: Investigacion clean-room experimental. Lee AC1015/AC1018. Writer AC1015 validado por oráculo externo (ODA File Converter). NO disponible en producto. Sin dependencias runtime. `private: true`, `UNLICENSED`.

---

## 9. Resumen de hallazgos principales

### Fortalezas

1. **Motor de comandos bien separado**: reductor puro sin dependencias de UI, testeable en Node.
2. **Sistema de disen~o con gate**: 7 reglas que impiden la degradacion. Tokens consumidos, no documentacion muerta.
3. **Cinta generada del registro**: no se desincroniza. Funcion total con clasificacion por patron + kind.
4. **Linea de comandos profesional**: sugerencias, historial, autocompletado, repetir con Espacio, comandos transparentes.
5. **API robusta**: guards globales, CAS, rate limiting atomico, outbox con HMAC, CFDI mexicano.
6. **i18n es-MX verificado**: formato de numeros y fechas con gate que impide regresion.
7. **Paquetes limpios**: contracts sin runtime, SDK generado, codec experimental aislado.

### Deudas mayores

1. **Monolito del editor**: `Layout3DEditor.tsx` esta en su techo (19.002/19.002 lineas). `check:cad` prohibe tocarlo. Toda extraccion es bienvenida.
2. **`use-command-engine.ts`** (664 linees) es el archivo mas denso del area de comandos.
3. **Sin paleta de propiedades**: panel flotante de AutoCAD que muestra/edita propiedades del seleccionado.
4. **Sin Dynamic Input**: las opciones solo aparecen en la linea de comandos, no bajo el cursor.
5. **`commercial` module** (65+ archivos) es candidato a descomposicion.
6. **LocalStorage para preferencias**: paletas de herramientas, pestana de cinta, estado colapsado se pierden al cambiar de navegador.

### Huecos grandes vs AutoCAD

| Area | Hueco |
|------|-------|
| Cinta | Sin panel contextual, sin navegacion por flechas |
| Linea de comandos | Sin Dynamic Input, sin barra de opciones |
| Paletas | Sin paleta de propiedades, sin paletas en servidor |
| Motor | PAR (referencia paralela) incompleto |
| i18n | Nombres de comandos siempre en ingles |
| API | Sin multi-region, sin GraphQL |

---

> Fin del inventario.
