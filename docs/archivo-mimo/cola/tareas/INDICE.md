# Indice de tareas

Cada tarea es un fichero `.mimocode/tareas/Dxx.md`. Abre SOLO el de la tarea que vas a hacer.

## Bloquean al usuario (primero)
- **D01** (minutos) La casilla dibujada de los Términos no es pulsable: el input real mide 1 px y vive fuera del <label>
  `apps/web/src/components/ui/Toggle.tsx:44-73`
- **D02** (una-sesion) El despliegue puede arrancar SIN proveedor de correo, y entonces nadie verifica nunca su cuenta
  `apps/api/src/modules/outbox-receiver/outbox-receiver.module.ts:47-55`
- **D03** (una-sesion) Entrar con la contraseña CORRECTA y el correo sin verificar responde «Credenciales inválidas»
  `apps/api/src/modules/identity/identity.service.ts:212-213`
- **D04** (una-sesion) La cookie CSRF la escribe api.vallecad.com sin Domain: el JavaScript de vallecad.com no puede leerla
  `apps/api/src/modules/identity/identity.controller.ts:345-351`
- **D05** (minutos) El CTA de registro de /demo queda pintado DETRÁS del editor
  `apps/web/src/app/demo/DemoStudio.tsx:67`
- **D06** (una-sesion) F6 — Los legales: cambiar el nombre obliga a PUBLICAR versión nueva, no a editar
  `scripts/legal/check-legal-content.mjs:97`
- **D07** (una-sesion) El DXF del cliente entra siempre en milímetros: $INSUNITS se ignora
  `apps/web/src/lib/cad/document-import.ts:236`

## Se ve precario
- **D08** (minutos) El botón «Reenviar» de «Revisa tu correo» se traga cualquier error y siempre dice que lo envió
  `apps/web/src/components/AuthPage.tsx:361-370`
- **D09** (minutos) «Seleccio nar»: el botón de la paleta mide 48 px de contenido y parte las palabras a media sílaba
  `apps/web/src/components/cad/editor/CadToolPalette.tsx:148`
- **D10** (una-sesion) «Algo salió mal» y «Comentarios» flotan sobre el panel Biblioteca porque están anclados al viewport, no al lienzo
  `apps/web/src/components/cad/studio/CadIncidentReporter.tsx:137`
- **D11** (una-sesion) Tres píldoras comparten el mismo anclaje abajo-centro y una de ellas pisa la línea de comandos
  `apps/web/src/components/cad/studio/viewport-hints.tsx:113`
- **D12** (minutos) El panel «PRIMEROS CINCO MINUTOS» se come 480x346 px del dibujo y crece hacia arriba desde la línea de comandos
  `apps/web/src/components/cad/onboarding/CadGuidedTourDock.tsx:171`
- **D13** (una-sesion) «Algo salió mal» no es un error: es el botón de soporte montado encima del panel de Biblioteca
  `apps/web/src/components/cad/studio/CadIncidentReporter.tsx:137`
- **D14** (minutos) El aviso inferior y la línea de comandos comparten el mismo anclaje bottom-3
  `apps/web/src/components/cad/studio/viewport-hints.tsx:113`
- **D15** (minutos) /sla imprime una ruta del repositorio, con comillas markdown incluidas, al cliente
  `apps/web/src/app/sla/SlaPage.tsx:231`
- **D16** (minutos) /sla promete que sus cifras salen del catálogo real y están escritas a mano
  `apps/web/src/app/sla/SlaPage.tsx:119`
- **D17** (minutos) Las públicas hablan al «operador del despliegue», no al cliente
  `apps/web/src/app/contact/page.tsx:32`
- **D18** (una-sesion) Indicadores en inglés y sin acentos en la barra de estado del taller
  `apps/web/src/components/cad/studio/CadStatusBar.tsx:296`
- **D19** (minutos) /terms enseña una ruta cruda «/sla» como texto de enlace
  `apps/web/src/app/terms/page.tsx:69`
- **D20** (minutos) F1 — El manifiesto: dos líneas que mueven 18 ficheros solas
  `packages/contracts/src/brand.ts:81`
- **D21** (minutos) F2 — El wordmark y los 7 SVG de marca, con un gate que no está enchufado
  `apps/web/src/components/brand/logo-geometry.ts:75`
- **D22** (una-sesion) F3 — El taller CAD escribe la marca a mano en 8 ficheros
  `apps/web/src/components/cad/CadStudioHost.tsx:108`
- **D23** (una-sesion) F4 — Páginas públicas y metadata SEO: 29 ocurrencias en 24 ficheros
  `apps/web/src/app/seo-surface.spec.ts:194`
- **D24** (una-sesion) F5 — Las guías de /docs: 18 ocurrencias en 8 ficheros de prosa
  `apps/web/src/app/docs/dxf-vs-dwg/page.tsx:57`
- **D25** (minutos) F7 — Las 149 plantillas: una línea cambia 298 hashes (y ningún docHash)
  `apps/web/src/lib/cad/template-render.ts:153`
- **D26** (una-sesion) F8 — La API: correos, CFDI y el emisor TOTP
  `apps/api/src/modules/outbox-receiver/email-templates.ts:38`
- **D27** (una-sesion) F9 — La marca dentro de los archivos que el cliente entrega (PDF, STEP, IGES)
  `apps/web/src/lib/cad/plot/plot-pdf.ts:272`
- **D28** (una-sesion) La paleta flotante parte las palabras a media sílaba y repite lo que ya está en la cinta
  `apps/web/src/components/cad/editor/CadToolPalette.tsx:148`
- **D29** (minutos) El botón «Algo salió mal» flota encima del panel de Biblioteca y parece una pestaña rota
  `apps/web/src/components/cad/studio/CadIncidentReporter.tsx:137`
- **D30** (una-sesion) La barra de estado dice «Release Sin validar»: vocabulario industrial en inglés en un plano de arquitectura
  `apps/web/src/components/cad/studio/CadStatusBar.tsx:339`
- **D31** (minutos) El panel de láminas —donde se fija la escala del plano— está en inglés
  `apps/web/src/components/cad/palettes/CadLayoutManager.tsx:477`

## Falta capacidad frente a AutoCAD
- **D32** (una-sesion) Inicio son 159 botones en una tira de ~10.500 px con la barra de desplazamiento oculta: sólo se ve el 18 %
  `apps/web/src/components/cad/ribbon/CadRibbon.tsx:164`
- **D33** (varias-sesiones) Todos los botones de la cinta pesan lo mismo: no hay comando primario ni desplegables
  `apps/web/src/components/cad/ribbon/CadRibbonButton.tsx:48`
- **D34** (varias-sesiones) /terms y /privacy se declaran borradores y no cumplen la LFPDPPP: no son publicables
  `apps/web/src/app/privacy/page.tsx:100`
- **D35** (una-sesion) Los alzados verdaderos se recortan a 87,8°: VIEW/VPOINT Frontal nunca da un alzado
  `apps/web/src/components/cad/viewport/camera-policy.ts:151`
- **D36** (una-sesion) El detector de choques descarta el par entero cuando dos rutas se empalman en un punto
  `apps/web/src/lib/cad/plant/clash.ts:710`
- **D37** (minutos) El botón «Vista frontal» del ViewCube da una vista inclinada 21°, no un alzado
  `apps/web/src/components/cad/viewport/camera-view-presets.ts:99`
- **D38** (una-sesion) PERSPECTIVE sigue sin cambiar la cámara: la variable no tiene lectores y setProjection no tiene llamadores
  `apps/web/src/lib/cad/engine/commands/view-visual.ts:161`
- **D39** (una-sesion) T4: raySegmentDistance descarta toda arista paralela al rayo y acota u sin recalcular t
  `apps/web/src/lib/cad/pick3d/edge-ray.ts:153`
- **D40** (una-sesion) Las jambas de puertas y ventanas siguen sin snaps aunque llegue el documento
  `apps/web/src/lib/cad/opening-entity-adapter.ts:265`
- **D41** (una-sesion) Una cota sobre un muro nunca es asociativa: el vocabulario de anclajes no conoce el muro
  `apps/web/src/lib/cad/engine/commands/annotate-support.ts:67`
- **D42** (una-sesion) Toda cota sobre una polilínea nace suelta, y el código lo declara
  `apps/web/src/lib/cad/engine/commands/dimension-support.ts:100`
- **D43** (varias-sesiones) El espacio papel del DXF del cliente se tira entero: llegan los muros pero no las láminas
  `apps/web/src/lib/cad/dxf-model-space-scope.ts:11`
- **D44** (una-sesion) No hay vista previa de trazado: el arquitecto imprime a ciegas
  `apps/web/src/components/cad/command-line/use-command-engine.ts:303`
- **D45** (una-sesion) El PDF trazado nunca incrusta fuentes: las cotas se descolocan en el visor del municipio
  `apps/web/src/components/cad/command-line/use-command-engine.ts:303`

## Deuda interna
- **D46** (una-sesion) El gate que vigila los solapes es ciego a TODAS las capas que tapan el dibujo
  `apps/web/e2e/golden/67-cad-nada-tapa-un-control.spec.ts:168`
- **D47** (minutos) F0 — Verificar que ninguna variable de entorno gane al código
  `.github/workflows/release.yml:169`
- **D48** (una-sesion) F10 — Gate anti-recaída: sin él, la marca vieja vuelve en el próximo commit
  `packages/contracts/src/brand.ts:4`
- **D49** (minutos) NO TOCAR: la base de datos `valle_design_*` y los 5 nombres npm
  `.env.example:6`

## Seguridad y privacidad del alta (supervisor, 18-sep 10:45) — frente 6, uno por commit
- (S01 y S02 RETIRADAS 10:55: el correo del titular en la web y en los contratos es intencional, es el contacto del fundador. No lo toques.)
- **S03** (una-sesion) `connect-src *` en la CSP de `apps/web/next.config.ts`: acotalo a `'self'`, el
  origen de la API (`NEXT_PUBLIC_API_URL`) y lo que de verdad use el producto (WebRTC/TURN si aplica).
  Antes de cerrarlo, corre los goldens de llamadas y de guardado: si algo deja de conectar, anadelo con
  su motivo en el comentario, no vuelvas a `*`.
- **S04** (minutos) `poweredByHeader: false` en `apps/web/next.config.ts` (hoy responde `x-powered-by: Next.js`).
- **S05** (minutos) `apps/web/src/lib/cad/architecture-grid.ts` `cadGridAlphaKey`: con mas de 24 ejes el
  orden sale al reves. Indice 25 da «BA» y deberia ser «AB» (el do/while ANADE la letra al final en vez de
  anteponerla). Anade al spec los casos 24→«AA», 25→«AB», 47→«AZ» y arreglalo. (supervisor, 18-sep 11:20)
