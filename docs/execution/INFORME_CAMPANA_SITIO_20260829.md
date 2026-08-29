# INFORME · Campaña de sitio comercial de clase mundial — 2026-08-29

**Rama:** `claude/valle-design-premium-campaign-24joj2` (base main @ `cadaa0b`) · PR [#117](https://github.com/Sergiovalle3121/valle-design/pull/117)

> Regla del documento (la misma de la bitácora): toda cifra fue medida en este
> contenedor o leída de un artefacto committeado. Lo no medido se declara
> pendiente; nada se estima. La bitácora con el detalle por ítem vive en
> `CAMPANA_SITIO_20260829.md`.

---

## 1. Lo publicado, ola por ola

### OLA 0 · Velocidad (las fuentes primero)

- **1 486 KB → 534,5 KB de tipografía por página** (−64 %): seis subconjuntos
  woff2 generados por inventario REAL de la interfaz (es-MX completo + GD&T
  ⌀ ⌒ ⌖ ⏤ ⏥ Ⓛ Ⓜ Ⓢ + griego de ingeniería + flechas + matemáticas), con las
  funciones OpenType por cara (la mono SIN liga/calt: quien teclea `->` tiene
  que ver `->`). Dos precargas quirúrgicas — 215,6 KB de ruta crítica — y
  `Cache-Control: immutable` con nombre hasheado.
- **@font-face manual** en vez de `next/font`: la romana+itálica viven en la
  MISMA familia (si no, el matching sintetiza la oblicua — fidelidad MText) y
  se esquiva el archivo `.p.` duplicado que `next/font` emitía al desdoblar
  la precarga (descarga doble medida en el build). Métricas de respaldo
  sincronizadas con Arial por cara (ascent/descent/size-adjust).
- **Lighthouse móvil medido: / 73→81 · /precios 75→85 · /register 74→87**
  (LCP 8,87-9,17 s → 5,04/4,21/4,06 s). Escritorio: 94 → 98/99/99.
- **Umbrales bloqueantes SUBIDOS y committeados: 0,70→0,78 móvil,
  0,90→0,95 escritorio.** Solo pueden subir desde ahí.
- Dos hipótesis del LCP de portada FALSADAS por experimento (font-display:
  optional y aurora congelada — ninguna lo movió); causa real diagnosticada:
  el modelo lantern ancla el pintado tras la hidratación y el costo fijo es
  el cascarón compartido (~272 KB gzip). Pintado real medido con CPU 4×:
  872 ms. El remedio (dieta de layout por grupo de rutas) queda en backlog
  con el diagnóstico escrito.

### OLA 1 · El escaparate de 149 plantillas

- **149 planos públicos dibujados por el MOTOR** — no miniaturas, no stock:
  conversor de plantilla a entidades nativas (puertas con jamba+hoja+arco,
  ventanas con vidrio, columnas, escaleras con huella de 280 mm…),
  proyección real del plano y volteo y (el modelo es y-arriba), tinta
  garantizada sobre papel claro, cajetín leído de los atributos reales.
  3 480 entidades en total; `gridSize:1` tras cazar que la retícula de 100
  recortaba la pieza mecánica de 400 mm.
- `/plantillas` (búsqueda + giros con estado en URL, aria-live) y **149
  fichas prerrenderizadas**, cada una con su lámina PDF por el trazador REAL
  y su OG dibujado. SEO: ItemList + CreativeWork por ficha.
- **Manifiesto de deriva committeado** (`template-gallery.json`: hash de
  documento y de ambos SVG por plantilla) con gate `check:template-gallery`
  dentro de `check:cad`: si el motor cambia un trazo, el build lo dice.
- Portada: sección de 8 destacadas (una por giro), cero JS añadido.

### OLA 2 · Probar sin cuenta (spike VERDE ejecutado)

- El spike de 45 min encontró la costura exacta: el editor de 19 000 líneas
  toca la red en TRES puntos, los tres dentro del `DocumentLifecyclePort`.
  Veredicto VERDE escrito en bitácora antes de construir.
- **/demo**: el editor real sin cuenta. Puerto de documentos que guarda en
  `localStorage` (`valle_demo_document`) con versión monotónica y descompresión
  del gzip de archivo; cajetín «Demostración»; banner permanente con
  `returnTo`; **adopción del dibujo al registrarse** (el primer documento de
  la cuenta nace del dibujo del visitante).
- Primera carga **280,9 KB** (el import estático la subía a 417,5 — puerto y
  editor llegan por `import()` tras hidratar).
- E2E humo: cero peticiones a rutas de documentos, autosave verificado.

### OLA 3 · Movimiento con propósito

- **ShowcaseFlows**: dibujar→acotar→publicar contado con los comandos DE
  VERDAD (LINE tecleándose carácter a carácter solo-opacity, el muro de
  6 000 mm, DIMLINEAR rotulando 6.000, PLOT con cajetín A-101 · ESC 1:50 ·
  A1). Panel pegajoso en escritorio, escena por paso en móvil, activación
  por IntersectionObserver, `prefers-reduced-motion` = escenas terminadas.
- **«Ingeniería que puedes auditar»**: las cifras se importan de artefactos
  EN BUILD (`site-evidence.ts`) — la página no puede publicar un número que
  el repositorio no haya medido. Publicadas: **761 casos contra oráculo ·
  192 comandos con veredicto · 0 éxitos falsos · 149 plantillas con hash**.
- **RevealOnScroll** única primitiva (IO + tokens del sistema), con dos
  lecciones de axe integradas: `visibility:hidden` en el estado pendiente y
  marcado `ul>li` válido.

### OLA 4 · Las páginas que un sitio comercial debe tener

- **/casos-de-uso + 5 perfiles** (arquitectos, ingeniería civil,
  interiorismo, construcción, estudiantes): cada paso del flujo nombra una
  capacidad con módulo y spec; las imágenes son renders del motor del giro;
  FAQ propia con JSON-LD.
- **/seguridad**: 8 hechos verificados en el código ANTES de escribirse.
  Precisión deliberada: el aislamiento se describe como **guard de
  pertenencia por petición, NO «RLS»** — esta casa no redondea hacia arriba.
- **/support potenciado** (búsqueda instantánea sobre el mismo índice de
  texto, correo escrito, estado enlazado) en vez de duplicar en /soporte.
- **SiteFooter** de 4 columnas sustituye los dos pies → todas las públicas.
- Sitemap: **177 rutas**; los segmentos dinámicos entran desde sus módulos
  (lección de arquitectura del spec de SEO, aplicada dos veces).

### OLA 5 · El estudio por encima

- **Trampa de foco en `CadDialogShell`** (patrón de Modal, `FOCUSABLE` con
  una sola definición): el marco arregla a los OCHO cuadros a la vez.
  Verificada en E2E: 12 Tabs jamás escapan, Escape cierra, foco devuelto.
- **Gate nuevo `axe-estudio`** (el editor real en /demo, ambos temas, cero
  serias sin lista de excepciones). **Cazó 3 defectos reales al estrenarse**
  — aria-readonly en un div sin rol, select de aprobación sin nombre,
  tabs con indigo crudo bajo contraste — los tres arreglados.
- **Controlador de espacios-papel** (`paper-spaces-host.ts`, P1-FE2a):
  cinco estados fuera del monolito con setters de firma React (los ~120
  usos no cambiaron ni uno). **Trinquetes ABAJO y committeados:
  140→135 useState · 19 137→19 134 líneas.**
- **Hoja de atajos imprimible**: lámina A4 apaisada de 3 columnas con la
  marca, tokens `--print-*` (cero hex sueltos), verificada generando el PDF.

---

## 2. La verdad medida (OLA FINAL)

Infraestructura real levantada en el contenedor: PostgreSQL 16.13 (initdb
local, sin docker) + API NestJS con migraciones (arriba en 3 s) + build de
producción con el origen real inlineado (verificado en los chunks).

| Prueba | Resultado |
| --- | --- |
| **La Jornada Real** (sin mocks) | **10/10 en 12,4 s** — registro→verificación→org, CAS, re-login con los mismos números, DXF con el muro en 3500 verificado por contenido, review link en 2.º contexto, día 91: abre y exporta, no edita |
| Embudo gratuito | 6 clics · 7 pantallas sin tarjeta · **la oferta anunciada ES la concedida** (TRIAL_DAYS=90 leído del catálogo) |
| Barrido E2E (chromium, API real) | **212 ✅ · 1 flake por carga · 19 saltadas** en 43,2 min. La única roja (golden 15, MTEXT) cayó bajo el eslint de 4 GB corriendo en paralelo — error de orquestación MÍO — en código byte-idéntico a main; **3/3 en verde en aislamiento** |
| Unit web | **447/447** |
| API | typecheck ✅ · unit ✅ · **pg contra PostgreSQL real ✅** · lint ✅ |
| `npm run lint` web (bloqueante de CI) | **0 errores** · 201 avisos ≤ trinquete |
| `check:cad` completo (fuentes, contraste 76 pares, superficie, convenciones, monolito, matemática 761, normas, DWG, galería 149, legal, rúbrica…) | **verde de punta a punta** (corpus DWG verificado contra espejo local del repo pinneado) |
| Presupuesto de bundle (14 rutas) | **todas bajo techo**: / 290,4/295,2 · /plantillas 346,2/356,5 · ficha 272,5/280,7 · /demo 280,9/289,2 KB gzip |
| Lighthouse (gate 0,95 escritorio / 0,78 móvil) | **OK** — escritorio 99·99·99 (LCP 1,04/0,90/0,90 s) · móvil 80·90·87 (LCP 5,11/3,61/4,06 s) · accesibilidad 100 en las 6 medianas · CLS 0,000 |

## 3. Los tres hallazgos de la final (los gates trabajando)

1. **`check:conventions`**: `demo-port.ts` (OLA 2) vivía en `lib/` importando
   de `components/` — dirección prohibida. **Los SEIS runs de CI de la rama
   murieron en ese gate en ~60-90 s y el job E2E quedó `skipped` seis
   veces**: CI nunca corrió Playwright sobre la campaña. La ceguera fue
   doble — localmente las tuberías enmascararon el código de salida (lección
   ya asumida: `cmd > log; CODE=$?`), y el rojo de CI no se leyó hasta la
   final. Arreglo por arquitectura: el puerto vive ahora junto a
   `design-port.ts`, que implementa el mismo contrato.
2. **`session-storage.spec`** (446/447): la regla «localStorage solo claves
   autorizadas» no conocía `valle_demo_document`. Se autoriza CON su porqué
   (es el dibujo del visitante — lo contrario de una credencial escondida) y
   el spec del demo escribe la clave literal donde toca el storage, atada a
   la constante con un guardián.
3. **CI 566 (el primero que pasó de conventions)**: `rules-of-hooks`
   bloqueante sobre `useCaseProfile` — búsqueda pura con nombre de Hook
   llamada desde `generateMetadata`. Renombrada `findUseCaseProfile`.
   **Por qué el gate local no lo vio**: `check:lint-budget` traga el exit 1
   de eslint a propósito (solo presupuesta avisos; los errores los bloquea
   el `npm run lint` de CI) — y la receta local no corría ese lint. Ya lo
   corre.

## 4. F.3 · Capturas regeneradas

Las 6 capturas de `public/product/` se regeneraron con el guion real (el
plano dibujado comando a comando, ambos temas, guardia de vocabulario
muerto en verde) porque la OLA 5 recoloreó los tabs del estudio:
la portada no enseña un indigo que ya no existe. `sample-plan.json` —el
plano que abre el tablero— se regeneró con el mismo guion: la captura del
hero y el ejemplo que se abre siguen siendo EL MISMO dibujo. Los renders de
las 149 plantillas y los OG son al vuelo (route handlers): no envejecen.

## 5. Pendientes priorizados

1. **Dieta de cascarón para las públicas** (ruta a portada móvil ≥85 con el
   diagnóstico ya escrito: ~272 KB gzip compartidos incluso en /docs).
2. **Los 3 controladores restantes del monolito** (P1-FE2 b): mapa y paso
   siguiente escritos en `DEUDA-MONOLITO.md` (migrar acciones al anfitrión).
3. **Demo**: suprimir el fetch del catálogo de bloques; indicador «API
   online» optimista; Escape que cancela el tramo en curso (nit de UX).
4. **Screencast MP4/WebM real** cuando haya CDN (R.1 parcial: la secuencia
   SVG cumple hoy; el video llega con CDN y poster).
5. **Defectos de producto anotados por el guion de capturas**: colocar una
   puerta reencuadra la cámara sola; `LAYER`/`PROPERTIES` tecleados no abren
   su paleta anclada.

## 6. Los siguientes diez (cola de reserva + deuda con nombre)

R.1 `/sistema` — styleguide vivo de primitivas como superficie de axe y
goldens visuales. R.2 P1-FE3 — Web Vitals de campo con su decisión de
producto (endpoint sin sesión) delante. R.3 Blog técnico — 3 entradas
listas para redactar desde informes (la precisión del PDF, el modo sin
rehenes, la matemática contra oráculo). R.4 P1-F3 — Entrar con Google,
campaña propia con el mapa ya escrito. Y los cinco pendientes de arriba.

## 7. Tabla antes/después (F.2)

| Dimensión | Antes (main @ cadaa0b) | Después (esta rama) |
| --- | --- | --- |
| Tipografía por página | 1 486 KB (5 caras, 3 TTF sin comprimir, todas precargadas) | **534,5 KB** en 6 subconjuntos woff2 · 2 precargas (215,6 KB críticos) · immutable |
| Lighthouse móvil / · /precios · /register | 73 · 75 · 74 (LCP 8,87-9,17 s) | **81 · 85 · 87** (LCP 5,04 · 4,21 · 4,06 s) |
| Lighthouse escritorio | 94 · 94 · 94 | **98 · 99 · 99** |
| Umbral bloqueante | 0,70 móvil · 0,90 escritorio | **0,78 · 0,95** |
| Imágenes de producto | 6 capturas | 6 regeneradas + **149 planos del motor al vuelo** (2 temas, gate de deriva) |
| Sitemap | 28 rutas | **177 rutas** |
| Probar sin cuenta | no existía | **/demo** real: 0 peticiones de documentos, adopción al registro |
| Prueba social | ninguna | evidencia de ingeniería de artefactos: 761 · 192 · 0 · 149 |
| Páginas comerciales | precios, novedades, educación | + casos-de-uso ×5 · seguridad · support con búsqueda · SiteFooter |
| Monolito | 19 137 líneas · 140 useState | **19 134 · 135** (trinquetes committeados) |
| Axe del estudio | sin gate | **gate 2/2** (3 defectos reales cazados; trampa de foco probada) |
| Jornada Real | 10/10 | **10/10 en 12,4 s** |
| CI de la rama | 6 runs rojos ~60-90 s (E2E skipped ×6) | gates arreglados; el run del cierre corre la suite completa |
