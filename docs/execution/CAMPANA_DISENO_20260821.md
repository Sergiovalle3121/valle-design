# CAMPAÑA AUTÓNOMA DE DISEÑO — 2026-08-21

**Territorio:** `apps/web` (capa visual), `apps/web/public/`, `docs/design/`.
**Misión:** que Valle Design SE VEA como una herramienta profesional de 199/mes que
compite con AutoCAD. El sistema de diseño ya existe y está bien pensado; el problema
es que **nadie lo consume**. Esta campaña no reescribe el sistema: **lo cablea**.

## Regla de oro

> Ningún hex fuera de `globals.css`. Ningún tamaño fuera de la escala.
> Si dudas entre inventar un valor y usar el token que ya existe, **gana el token**.
> Si el token no existe, se añade AL SISTEMA y se consume desde ahí.

## Reglas de no-romper

- **NUNCA** cambiar, borrar ni renombrar un `data-testid`. 61 goldens + 5 E2E cuelgan de ellos.
- El **trinquete del monolito SOLO BAJA** (`Layout3DEditor.tsx`). Mejorar ahí = extraer, no añadir.
- Prohibido tocar lógica CAD (geometría, comandos, motor, persistencia, DXF/DWG, API).
- Contraste AA como piso. Nada por debajo de 11px sobrevive.
- `prefers-reduced-motion` respetado en cada animación nueva.
- Español es-MX. Cero emojis en la UI.
- Sin claims inventados. La sección "Lo que todavía no hacemos" se queda íntegra.

## Métricas de partida (medidas 2026-08-21, antes de tocar nada)

| Métrica                                | Antes |
| -------------------------------------- | ----- |
| `text-[Npx]` arbitrarios (.tsx)         | 659   |
| valores distintos de `text-[Npx]`       | 13    |
| clases `cyan-*`                         | 327   |
| hex hardcodeados en .tsx (ocurrencias)  | 56    |
| hex distintos en .tsx                   | 26    |
| `shadow-2xl` vs `shadow-sm`             | 29/2  |
| `<button>` a mano                       | 329   |
| `<input>` a mano                        | 127   |
| `<select>` a mano                       | 44    |
| archivos en `src/components/ui/`        | 1     |
| archivos de imagen en `public/`         | 0     |
| **Tokens consumidos**                   |       |
| `bg-card`                               | 0     |
| `bg-primary`                            | 0     |
| `text-muted-foreground`                 | 0     |
| `border-border`                         | 0     |
| `.type-display` / `.type-title`         | 0 / 0 |
| `.type-lead` / `.type-eyebrow` / `.type-numeric` | 0 / 0 / 0 |
| `.premium-glass` / `.aurora-bg`         | 0 / 0 |
| `.hero-orb` / `.hero-conic` / `.product-halo` / `.float-slow` | 0 / 0 / 0 / 0 |
| `animate-pulse` / `skeleton`            | 0 / 0 |

## LA COLA

### OLA 0 — LOS CIMIENTOS QUE FALTAN

- [x] 0.1 Tipografía real (`next/font`: Inter + JetBrains Mono conectadas a `--font-inter` / `--font-jetbrains`)
- [x] 0.2 Unificar la marca (cian → índigo; ACI del dibujo intacto; un solo color de "activo")
- [x] 0.3 Limpiar el CSS muerto con criterio (borrar Recharts + AuroraBackground; marcar el resto por ola)
- [x] 0.4 Completar el mapeo a Tailwind (`--shadow-*`, `--radius`, `--tracking-*` en `@theme inline`)

### OLA 1 — LAS PRIMITIVAS QUE NO EXISTEN

- [x] 1.1 Primitivas en `src/components/ui/` (Button, Input, Textarea, Select, Checkbox, Switch, Card, Modal, Badge, Tooltip, Tabs, Skeleton, EmptyState, Spinner, ProgressBar)
- [x] 1.2 Escala tipográfica de 7 escalones + migración de los `text-[Npx]`
- [x] 1.3 Migración del embudo público a las primitivas
- [x] 1.4 Unificar radios a 3 escalones + deduplicar la tarjeta de auth

### OLA 2 — IDENTIDAD DE MARCA

- [x] 2.1 Logo (isotipo + wordmark + lockup, claro/oscuro/mono, componente `<Logo/>`)
- [x] 2.2 Favicon (`icon.tsx`, `apple-icon.tsx`, `icons:` en metadata)
- [x] 2.3 Imagen Open Graph (`opengraph-image.tsx`, `twitter-image.tsx`, por ruta)
- [x] 2.4 `manifest.webmanifest`
- [x] 2.5 `docs/design/BRAND.md`

### OLA 3 — LANDING ULTRA PREMIUM

- [x] 3.1 Capturas reales del producto (script Playwright reproducible → `public/product/`)
- [x] 3.2 Hero con el producto como imagen (halo + orbes + float ya escritos)
- [x] 3.3 Secciones reordenadas para vender
- [x] 3.4 Nav sticky con blur + hamburguesa real
- [x] 3.5 Conmutador de tema global (nav pública + dashboard)
- [x] 3.6 `/precios` con jerarquía, plan destacado, IVA y CFDI

### OLA 4 — EL EMBUDO DE ALTA

- [x] 4.1 Registro sin callejón ("Revisa tu correo")
- [x] 4.2 Verificación por enlace, token como respaldo
- [x] 4.3 Organización sin jerga (slug derivado + "trabajo por mi cuenta")
- [x] 4.4 El primer minuto (tres caminos; plano de ejemplo)
- [x] 4.5 Estados (skeletons, vacíos ilustrados, `loading/error/not-found/global-error`)
- [x] 4.6 Skip link real a `#contenido`

### OLA 5 — LA PRIMERA IMPRESIÓN DEL ESTUDIO

- [x] 5.1 Jerarquía de la barra superior (el "Cerrar" rojo deja de ser lo más fuerte)
- [x] 5.2 Fuera la telemetría de desarrollador (tras modo diagnóstico)
- [x] 5.3 Iconos en la paleta de herramientas + tooltip con alias
- [x] 5.4 Arreglar el modo claro de las paletas CAD
- [x] 5.5 Rediseñar el tour "Primeros cinco minutos"
- [x] 5.6 Densidad coherente en el chrome del estudio

### OLA FINAL — DOCUMENTAR Y PROBAR QUE MEJORÓ

- [ ] F.1 Suite completa de gates + goldens verdes + push
- [ ] F.2 Antes/después de las 6 pantallas clave → `docs/design/before-after/`
- [x] F.3 `docs/design/DESIGN_SYSTEM.md` + sección de diseño en `AGENTS.md`
- [x] F.4 `docs/execution/INFORME_CAMPANA_DISENO_20260821.md`

### COLA DE RESERVA

- [x] R.1 Sistema de movimiento tokenizado
- [ ] R.2 Rediseño de documentación y guías
- [ ] R.3 Ilustraciones SVG propias
- [ ] R.4 `/status` y soporte premium
- [ ] R.5 Modo presentación del estudio
- [ ] R.6 Infraestructura de claves i18n del estudio

---

## BITÁCORA

### 2026-08-21 — Arranque

Repositorio limpio en `main` (`7982cf3`). Diagnóstico verificado contra el código
antes de escribir una línea: los 659 `text-[Npx]`, los 327 `cyan-*`, los 0 usos de
todos los tokens semánticos y el único archivo en `src/components/ui/` son exactos.
El hex hardcodeado en `.tsx` mide 56 ocurrencias / 26 valores distintos (la cifra de
105 del diagnóstico incluye `.ts`); la conclusión no cambia.

`public/` contiene un solo directorio (`wasm/`) y ni un archivo de imagen. `layout.tsx`
no importa `next/font` en ninguna forma, así que `--font-inter` y `--font-jetbrains`
—declaradas en `globals.css:91-97`— nunca se definen y el stack cae siempre al
fallback del sistema.

**Suposición registrada:** el `public/` del proyecto es `apps/web/public/`, no un
`public/` en la raíz del monorepo (la raíz no tiene ninguno). Todo lo que la campaña
llama `public/` se escribe ahí.

### OLA 0 — cerrada

**0.1 · Tipografía real.** `layout.tsx` carga Inter y JetBrains Mono con
`next/font/google` como *variables* (`--font-inter`, `--font-jetbrains`), que es
exactamente lo que `globals.css` llevaba declarando y nadie definía. `display:
swap`, subconjunto `latin` (es-MX necesita acentos, ñ y signos de apertura) y el
respaldo con métricas ajustadas para que el cambio de tipo no mueva el layout.
Verificado en el build: 8 `.woff2` emitidos en `.next/static/media/` y las dos
variables presentes en el CSS de producción. La mono ya no es decorativa —
`.type-mono` fuerza `tnum` y `zero`, que es lo que distingue un 0 de una O en
una coordenada.

**0.2 · Marca unificada.** 327 clases `cyan-*` → `indigo-*` en 27 archivos.
Comprobado antes de tocar nada que en todo `src` NO existe un solo uso de la
cadena «cyan» que no sea una clase de Tailwind, así que la migración no podía
alcanzar un dato. Los colores ACI del dibujo (`#ff0000`, `#00ff00`, `#00ffff`…)
son hex y siguen intactos: son datos del plano, no marca. Los cuatro
conmutadores de dibujo pierden sus cuatro colores (cian/ámbar/violeta/fucsia) y
comparten UN estado activo tokenizado; lo que los distingue es su etiqueta, que
es lo que un dibujante lee de todos modos. Ningún golden asserta sobre color:
comprobado con grep sobre `e2e/**/*.ts`.

**0.3 · CSS muerto, con criterio.** Fuera de verdad: el bloque de tooltips de
Recharts (`recharts` no es dependencia del proyecto) y la marquesina de logos
(`marquee-*` + su keyframe) —un carrusel de logotipos de clientes que el
producto deliberadamente NO tiene— y `@keyframes sheen`, que no tenía ni una
clase que lo invocara. La referencia a un `<AuroraBackground/>` inexistente pasa
a nombrar quién lo consumirá. Todo lo demás se queda **con la ola que lo cablea
escrita al lado**, para que la próxima auditoría distinga «pendiente» de
«basura» sin volver a razonarlo. De paso `.mission-grid` deja de pintar líneas
blancas fijas —invisibles en tema claro— y sale del token de borde.
825 → 771 líneas antes de añadir la escala.

**0.4 · Mapeo completo.** `@theme inline` gana `shadow-resting/elevated/floating`
y `brand`/`brand-strong`; un `@theme` nuevo (no `inline`) toma como ÚNICA fuente
el radio (`control`/`card`/`surface`), el interletraje y las dos curvas de
movimiento. El detalle que importa: un alias `inline` con el mismo nombre que su
variable de origen (`--tracking-display: var(--tracking-display)`) es circular y
el navegador lo descarta entero — por eso lo que no depende del tema se declara
en `@theme` a secas, que Tailwind emite igual en `:root`.

**Escala tipográfica (adelantada de la ola 1 porque es sistema, no consumo):**
siete escalones `display · title · heading · body · small · caption · mono`, más
`micro` como piso duro de 11 px. Verificados los siete en el CSS de producción.

**Gates:** `typecheck` ✅ · `build` ✅ · `lint` ✅ (0 errores, 196 avisos
preexistentes) · `test` ✅ 385/385 · gates CAD ✅ (contrato, línea, monolito
22 208 sin subir, wasm, normas-mx, nl-cad, rúbrica).

**PENDIENTE AJENO:** `check:dwg-evidence` falla **también en `main` limpio**
(comprobado con `git stash`). Es territorio de la sesión de DWG
(`scripts/dwg`, `packages/dwg-codec`), no de esta campaña; se deja como está.

### OLA 1 — cerrada

**1.1 · Las primitivas.** `src/components/ui/` pasa de UN archivo a doce, con
Button, Input, Textarea, Select, Checkbox, Switch, Surface/Card, Modal, Badge,
Tooltip, Tabs, Skeleton, EmptyState, Spinner y ProgressBar, todos consumiendo
tokens y ninguno escribiendo un hex. Tres detalles que no son cosméticos:

· **`buttonClass` vive en `styles.ts`, no en `Button.tsx`.** Una función
exportada desde un módulo con `"use client"` NO se puede invocar desde un
componente de servidor: Next la convierte en referencia remota y el build
revienta. Se descubrió con el build en rojo en `/docs/*`, y media docena de
páginas públicas son de servidor.

· **La palomita de la casilla se revela por COLOR, no por opacidad.** `peer-*`
genera un selector de hermano (`~`); sobre un nieto del hermano no engancha, y
la palomita habría quedado visible siempre.

· **El modal hace las cinco cosas que casi nunca se hacen**: foco atrapado, foco
devuelto al abridor, scroll bloqueado, Escape cierra y portal a `<body>` (dentro
de un ancestro con `transform`, un `position: fixed` cambia de sistema de
coordenadas). El clic en el velo cierra sólo si EMPEZÓ en el velo.

**1.2 · La escala.** 658 `text-[Npx]` migrados en 31 archivos. Trece valores →
cinco escalones, con piso duro en 11 px: los nueve tamaños que caían por debajo
(7 · 8 · 8,5 · 9 · 9,5 · 10 · 10,5 · 11 · 11,5) suben todos a `type-micro`. No es
pérdida de matiz: nueve tamaños dentro de una banda de cuatro píxeles nunca
fueron nueve decisiones.

Detalle de cascada que decidió el diseño: la escala vive en `@layer components`,
no fuera de capa. El orden de Tailwind v4 es `theme, base, components,
utilities`; fuera de capa, `.type-micro` habría GANADO a un `font-semibold`
puesto al lado y nadie habría entendido por qué. La escala es el suelo, no el
techo.

**1.3 · Embudo público migrado.** Registro, login, verificación, reenvío,
recuperación y restablecimiento pasan por las primitivas; `PublicPageShell`,
`GuideShell`, contacto, guías, licencias, estado, soporte, privacidad, términos,
precios y checkout quedan tokenizados (cero clases de paleta cruda). `publicActionClass`
—una de las cinco constantes de botón incompatibles— sobrevive con su nombre pero
ya sólo delega en `buttonClass`, así que no puede divergir.
**La portada y el tablero se migran en sus propias olas (3 y 4), donde se
rediseñan enteros; migrarlos dos veces habría sido trabajo tirado.**

**1.4 · Radios y duplicación.** Tres escalones (`control`/`card`/`surface`) y la
tarjeta de auth deduplicada en `<AuthShell/>`. Las dos copias ya habían
divergido: una traía el logo en índigo y la otra en cian.

**CONTRASTE — el hallazgo que obligó a ampliar el sistema.** Midiendo la paleta
para BRAND.md salieron cuatro fallos de AA que las primitivas iban a propagar:
`success` como texto sobre tarjeta blanca da **3,02:1**, `warning` **2,13:1**,
`danger` **3,78:1** y `primary` **4,41:1** — todos por debajo del 4,5 que exige
AA. Es la forma más común de fallar accesibilidad sin enterarse: reutilizar el
color del RELLENO como color de LETRA porque «es el mismo estado». Se añaden al
sistema los tokens `--success-ink`, `--warning-ink`, `--danger-ink` y
`--primary-ink`, calculados como el mínimo desplazamiento que despeja 4,5:1
contra las tres superficies claras. En oscuro los rellenos ya pasan (7,37 · 9,00
· 5,45) salvo el índigo, que da 3,11:1 y por eso se aclara ocho puntos.

### OLA 2 — cerrada

**2.1 · Logotipo propio.** Línea de cota con marcas a 45° (el remate del dibujo
arquitectónico mexicano, no la flecha) + una V que lee como valle y como
escuadra + el nodo cuadrado de la referencia a objetos. UNA geometría
(`logo-geometry.ts`) alimenta el componente `<Logo/>`, los siete SVG de
`public/brand/`, el favicon, el icono de iOS y la tarjeta social, con gate
`--check` que falla si un archivo se desincroniza. Los cuatro
`<DraftingCompass/>` pintados a mano quedan reducidos a uno —el de la ficha de
capacidades, donde ilustra «dibujo 2D» y no es el logotipo.

**2.2 · Favicon.** `icon.tsx` (32 px) y `apple-icon.tsx` (180 px, sin esquinas
redondeadas: iOS aplica su propia máscara y redondear dos veces deja un halo) vía
`ImageResponse`, más un `favicon.ico` real de tres tamaños rasterizado con sharp
desde el mismo SVG. `--check` sólo verifica que EXISTA: dos versiones de sharp
comprimen el mismo PNG distinto y eso no es una diferencia de diseño.

**2.3 · Tarjeta social.** `page-metadata.ts` prometía `summary_large_image` y no
declaraba ni una imagen, así que cada enlace compartido en WhatsApp —el canal de
venta real en México— salía como un rectángulo gris. Un renderizador
(`lib/seo/social-card.tsx`) y cuatro rutas: portada, X/Twitter, precios y guías.
La de precios NO lleva cifra: una tarjeta social se cachea durante días en cada
mensajería y un precio congelado en una imagen es una promesa que el producto
acabaría incumpliendo sin querer.

**2.4 · Manifiesto.** `manifest.ts` como ruta —no archivo estático— para que el
nombre y los colores sigan saliendo del manifiesto de marca. `themeColor` pasa a
tener DOS valores: con uno solo, la barra del navegador quedaba índigo sobre una
app en blanco.

**2.5 · `docs/design/BRAND.md`** con las 21 mediciones de contraste, las reglas
de uso del logo (tamaño mínimo, espacio libre, qué NO hacer) y las dos
excepciones autorizadas a «ningún hex fuera de globals.css», las dos de frontera
técnica: un `.svg` servido como imagen no ve las variables CSS, e `ImageResponse`
renderiza sin hoja de estilos.

**EL GATE.** `src/components/ui/design-system.spec.ts` convierte la regla de oro
en aserción: siete reglas que verifican que no hay tamaños fuera de la escala,
que el piso son 11 px, que no queda un acento fuera de la marca, que no hay hex
en la capa visual, que las primitivas existen, que la marca no se desincroniza —
y, la que de verdad importa, **que los tokens están EN USO**. Un gate que sólo
prohíbe habría dado por bueno el estado original: cero hex sueltos y cero tokens
consumidos.

**Gates:** `typecheck` ✅ · `build` ✅ · `lint` ✅ · `test` ✅ 386/386 ·
`design-system.spec` ✅ · **goldens 81/87**.

**PENDIENTE AJENO (medido, no supuesto).** Seis goldens fallan —21-xrefs,
47-lisp-appload, 47-solids, 53-bim-wall, 54-bim-wall-joins, 55-anchored-comments—
y **los seis fallan también en `main` limpio**, comprobado con `git stash` y una
corrida de control. Sus aserciones son de dominio CAD, no visuales:
`saved.meta.schema` esperando 6, el contador de comandos LISP y dos tiempos de
espera de paleta. Territorio de la sesión paralela.

**Nota de método:** correr los goldens mientras se edita NO sirve. El
`webServer` de Playwright es `npm run dev` y recarga en caliente con cada
guardado; la primera corrida dio seis fallos con duraciones de 3,5 y 4,6
minutos, firma inconfundible de una recarga a mitad de prueba. Toda medición de
goldens de aquí en adelante se hace con el árbol quieto.

### OLA 3 — cerrada

**3.1 · Capturas reales, reproducibles.** `apps/web/scripts/capture-product-shots.mts`
levanta el editor con los MISMOS fixtures herméticos de los goldens, dibuja una
planta comando a comando —`WA` para cada muro, `DLI` para cada cota, sobre la
plantilla mexicana de arranque— y fotografía seis pantallas a 2×. Si el producto
dejara de responder a un alias, el script FALLA en vez de fotografiar un lienzo
vacío: ésa es la única forma de que una captura no envejezca en silencio.

Dos cosas que la primera corrida enseñó y que ninguna auditoría de código habría
visto:
· **El editor arranca en 3D.** La planta salía como un plano inclinado en
  perspectiva, ilegible. Un CAD 2D que se anuncia con una órbita 3D vacía está
  enseñando lo que NO es. El script conmuta a 2D por el mismo control que usa
  una persona y encuadra con `ZOOM EXtensión` + `0.75X`, porque a ras de borde
  el plano se lee como recortado.
· **La barra superior dice «AXOS-CAD-STUDIO» y «0 estaciones · 0 equipos».** Son
  restos del producto de origen (MES/ERP) que un arquitecto ve en su primera
  pantalla. Va a la ola 5, que es su sitio.

**3.2 · El hero.** El producto ES la imagen. `<ProductFrame/>` lo enmarca en una
ventana —una captura a sangre se lee como error de maquetación; la misma dentro
de un marco con su barra de título se lee como «esto es el programa»— y cablea
`.product-halo` y `.float-slow`, que llevaban escritos con cero usos.
`<HeroBackdrop/>` cablea `.aurora-bg`, `.mission-grid`, `.hero-conic` y los tres
`.hero-orb`.

Corrección medida sobre la primera versión: los orbes iban con el color diluido
(`bg-primary/40`) ENCIMA de la opacidad 0,5 que ya aplica `.hero-orb` y de sus
80 px de desenfoque — tres atenuaciones multiplicándose dieron un fondo plano.
Van al color pleno. Y `.mission-grid` sale al pleno del token de borde: diluida
al 70 % era literalmente invisible sobre el fondo oscuro, y una textura
invisible es peso muerto.

**3.3 · Secciones reordenadas para vender.** Prueba visual → el modelo de
licencia → capacidades → para quién → honestidad → guías → FAQ → CTA. Los tres
bloques JSON-LD y toda la capa SEO intactos.

**DECISIÓN REGISTRADA sobre el argumento del precio.** La cola pedía «la
comparativa contra el costo anual de las alternativas, con la cifra verificable».
No se puede: `public-pages.spec.ts` prohíbe **cualquier cifra de precio en la
portada**, y con razón — el catálogo lo publica el propio producto desde su tabla
vigente y dos verdades sobre el mismo importe es una de más. La sección compara
MODELOS de licencia (no instalas nada · el dibujo no vive en un disco duro · se
paga por mes y se cancela desde el portal · factura CFDI con IVA incluido), que
es comprobable, y remata enlazando a `/precios`. Las cifras viven donde el
producto las publica.

**3.4 · Nav pegajosa.** Vidrio al desplazar y NO siempre: una barra con blur
permanente pone una lámina turbia sobre el hero desde el primer píxel. Menú de
móvil real —panel completo, Escape cierra, scroll bloqueado— en vez de cuatro
enlaces partidos en dos renglones. Y se extrajo a `<PublicNav/>`, así que
`PublicPageShell` la comparte: precios, guías, soporte, estado, privacidad,
términos y licencias ganan la misma barra de una sola vez.

**3.5 · Conmutador de tema global.** Tres estados, no dos: «sistema» es un
estado de pleno derecho, no el hueco entre los otros. Sin marcar hasta que monta
en cliente —el servidor no lee `localStorage`— para que no haya el salto de
estado que se ve como un error.

**3.6 · `/precios`.** Jerarquía real: el plan recomendado destaca con borde y
elevación, no tiñendo la tarjeta (teñirla la saca del sistema y obliga a
recalcular el contraste de todo lo que lleva dentro). El destacado es el PRIMER
plan de pago del catálogo, en el orden que publica el operador, y la etiqueta
dice «Nuestra recomendación» — no se inventa un «más vendido» porque ese dato no
existe. Sello fiscal visible (IVA incluido · factura CFDI · cancelas cuando
quieras), que es diferenciación real en México y estaba enterrado en una nota de
una línea. El importe va con `type-numeric`: sin cifras de ancho fijo, conmutar
mensual/anual daba un salto lateral en toda la tarjeta.

**Dos specs actualizados, ninguno debilitado.** `public-pages.spec.ts` y
`seo-surface.spec.ts` afirmaban que la portada enlaza `/login` y `/register`
comprobando el TEXTO de `page.tsx`. Al extraer la barra, los `href` se mudaron de
archivo. La comprobación ahora los SIGUE hasta `PublicNav.tsx` y además exige que
la portada monte `<PublicNav/>`: se defiende la intención —que un visitante pueda
llegar— en vez del sitio donde está escrita.

**Gates:** `typecheck` ✅ · `build` ✅ · `lint` ✅ · `test` ✅ 386/386.

**Verificación visual:** portada, registro, precios y guías capturadas en los dos
temas. `/precios` se verificó con el catálogo interceptado, porque la API
comercial no corre en local y la página —correctamente— se niega a inventar un
importe.

### OLA 4 — cerrada

**4.1 · Registro sin callejón.** Tras registrarse ya no hay un `<p>` verde: hay
una pantalla que NOMBRA el correo exacto al que se envió —el dato que necesita
quien tecleó mal una letra—, explica por qué puede tardar, y trae el reenvío
CON temporizador y sin salir de la pantalla. Mandar al usuario a otra página a
reescribir el correo que acaba de teclear es pedirle que repita trabajo justo
cuando ya dudaba de si funcionó.

El temporizador se encadena con `setTimeout` y no con `setInterval`: si la
pestaña se duerme, el intervalo acumula disparos y al volver descuenta varios
segundos de golpe.

**4.2 · Verificación por enlace.** El correo YA traía un enlace absoluto con el
token (`apps/api/.../email-templates.ts`); lo que faltaba era que al abrirlo
pasara algo — el enlace rellenaba el campo y el usuario tenía que pulsar un
botón. Ahora la verificación corre sola al montar, con una pantalla que dice que
está trabajando en vez de un formulario que se autoenvía y se queda visible
invitando a pulsarlo encima de una petición en curso. El campo de token queda
como respaldo detrás de «¿Tienes un código?»: quien llega sin enlace es la
excepción, y un campo a la vista convierte la excepción en el camino principal.

La guarda `autoVerified` importa: en desarrollo React monta cada efecto dos
veces a propósito, y sin ella el token se canjearía dos veces — la segunda
fallaría y el usuario vería «token inválido» tras una verificación que SÍ
funcionó.

**4.3 · Organización sin jerga.** Se le pedía a un arquitecto teclear un slug
conforme a `[a-z0-9]+(?:-[a-z0-9]+)*`, y si repetía lo que acababa de escribir
arriba el formulario lo rechazaba sin explicar nada. Ahora hay dos caminos:
«Trabajo por mi cuenta» —un botón, cero campos, nombre derivado del correo— y
«Tengo un despacho» —un campo, con el identificador derivado, VISIBLE (quien
comparta enlaces querrá saber cuál es) y editable sólo tras pulsar
«personalizar»—.

La derivación vive en `lib/organization-slug.ts` con su spec: acentos, ñ
(«Peña» → `pena`, no `pe-a`), recorte sin guion colgante y la garantía de que
lo derivado SIEMPRE pasa la validación de la API. El día que no la pase, el
alta se rompería en el paso más caro del embudo y sin mensaje que lo explique.

**4.4 · El primer minuto.** Tres caminos, y el primero decide la venta: «Abre un
plano de ejemplo» pone al usuario delante de un dibujo terminado en cinco
segundos. El plano NO se escribe a mano — `sample-plan.json` lo genera el mismo
script de capturas dibujando con los comandos reales, así que **es literalmente
el plano de la portada**: quien llegó por la captura del hero abre exactamente
lo que vio. Medido: 5 muros, 2 cotas, 19 capas, 5 estilos, espacio papel y
cajetín.

Y el ORDEN de la página depende del estado: con documentos creados mandan los
formularios; con el espacio vacío manda el primer minuto. Resuelto con `order`
y no duplicando los dos bloques en las dos ramas de un ternario — duplicarlos
habría duplicado también las seis validaciones que cuelgan de ellos.

**4.5 · Estados.** `animate-pulse` y `skeleton` medían CERO usos en toda la
aplicación y el tablero cargaba con un `<p>` centrado en blanco. Ahora hay
huesos con la silueta de lo que viene —al llegar los datos nada se mueve de
sitio— y las cuatro pantallas que faltaban: `loading.tsx`, `error.tsx`,
`not-found.tsx` y `global-error.tsx`. Antes, un 404 o un error de servidor
mostraban la pantalla por defecto de Next: la marca del FRAMEWORK, en inglés, en
la pantalla de un cliente mexicano.

`error.tsx` enseña el `digest`: en producción Next no manda el mensaje del error
al navegador —correctamente, un mensaje puede filtrar la forma de la base de
datos— y manda un identificador; enseñarlo permite que soporte encuentre ESA
entrada en el registro en vez de pedirle al usuario que describa lo que vio.

`global-error.tsx` es la TERCERA excepción autorizada a «ningún hex fuera de
globals.css», y la razón es dura: sustituye al documento entero, así que corre
SIN el layout raíz — sin `ThemeProvider`, sin las variables CSS, sin la
tipografía de `next/font`. Un componente que usara `bg-card` se pintaría sin
estilo dentro de la pantalla que existe para cuando todo lo demás ha reventado.

**4.6 · Skip link.** `<main id="contenido">` existía en dos sitios y NINGÚN
enlace apuntaba a `#contenido`: un ancla huérfana. Ahora hay `<SkipLink/>` en la
portada, en todas las páginas públicas y en el tablero, oculto con `sr-only` y no
con `display:none` —que lo sacaría del orden de tabulación y lo volvería inútil
para quien lo necesita.

**El tablero, de paso, queda tokenizado por completo:** cero clases de paleta
cruda, cero tamaños de Tailwind, y el formulario de organización extraído a su
propio archivo (eran 120 líneas dentro de un archivo de 712 que ya hacía otras
seis cosas).

**Gates:** `typecheck` ✅ · `build` ✅ · `lint` ✅ 0 errores · `test` ✅ 387/387.

**AVISO — SESIÓN PARALELA.** A mitad de esta ola, otra sesión («CAMPAÑA DE
IDENTIDAD», `docs/execution/CAMPANA_IDENTIDAD_20260822.md`) renombró
`components/line-engineering/` a `components/cad/` EN EL MISMO ÁRBOL DE TRABAJO.
El servidor de desarrollo se quedó con el grafo de módulos a medias y falló con
un `Module not found` que no era mío. Comprobado que el renombrado quedó
consistente (`typecheck` verde) y reiniciado el servidor. **Sus archivos se
sacaron del índice antes de cada commit**: AGENTS.md, ARCHITECTURE.md,
PRODUCT.md, README.md, REPOSITORY_SCOPE.md, IDENTITY.md, `site-routes.ts`,
`professional-blocks.spec.ts`, `docs/competitive/` y `scripts/cad/check-no-industrial-domain*`.

### OLA 5 — cerrada

**5.1 · El «Cerrar» deja de gritar.** Era un botón ROJO con sombra máxima
anclado a la izquierda: el elemento visualmente más fuerte de todo el estudio.
En una herramienta profesional SALIR nunca es lo más llamativo — y el rojo es el
color con el que se avisa de que algo se va a destruir; gastarlo en «volver al
tablero» lo deja sin significado para cuando de verdad haga falta. Ahora es un
control discreto y el peso visual vuelve al nombre del documento.

**5.2 · Fuera la telemetría de desarrollador.** «Tool: select», «Native 7»,
«U0/R0» y el distintivo del pipeline desaparecen de la vista del cliente — pero
NO del DOM. Dieciséis goldens las leen por `textContent` y por atributo, y son la
forma más barata de afirmar que una acción de dibujo dejó exactamente una entrada
de historial. Se esconden tras `?cadDiag=1`, el mismo mecanismo que ya usaba
`?cadRenderPipeline=legacy`. Comprobado antes de tocar nada: ninguna de las
dieciséis aserciones pide `toBeVisible`.

**5.3 · Iconos en la paleta.** Dieciocho etiquetas de texto a 10,5 px en un
producto con 79 iconos ya importados. Icono **y** etiqueta —un icono solo es un
acertijo la primera semana, y ésta es la primera semana de alguien que viene de
AutoCAD— y tooltip que enseña el ATAJO. Ésa era la joya enterrada: la tabla de
alias existía y no se anunciaba en ningún sitio. Quien pasa el cursor por
«Circle» y lee «C» acaba de descubrir que su memoria muscular de veinte años
sirve aquí.

**5.4 · El modo claro FUNCIONA por primera vez.** Catorce de las veinte paletas
tenían cero variantes `dark:` y fondos `bg-gray-950` fijos: al conmutar, el
lienzo se aclaraba y las paletas seguían negras. La causa era un idioma heredado
de un editor que sólo existía en oscuro —capas translúcidas de BLANCO sobre negro
fijo—, y ese idioma no tiene modo claro posible: un blanco al 5 % sobre blanco es
blanco. **Colores fijos en el chrome del estudio: 646 → 1** (el que queda es la
paleta categórica de celdas, que es dato del dibujo). El armazón pierde además su
ternario de tema: existía porque las paletas de dentro no giraban.

**5.5 · El acompañante.** La lógica no se toca ni una línea —lee el DIBUJO, no
cuenta clics, y es lo mejor del código—. Cambia la piel: panel verde de 11 px con
viñetas de texto y una `<progress>` sin estilar → tarjeta del sistema, barra de
progreso de las primitivas, iconos y una celebración discreta. Se conservan
íntegras las dos invariantes que sus comentarios defienden: `pointer-events-none`
en el panel con el puntero reclamado SÓLO por los botones, y `max-h-[32vh]`.

**5.6 · Densidad.** La escala de la ola 1 ya cubría el chrome del estudio: los
658 tamaños arbitrarios se migraron entonces, y esta ola sólo tuvo que retirar
los últimos siete iconos con color en línea.

**Trinquete del monolito: 22 208 → 20 661 líneas** y 153 → 145 `useState`. Cada
mejora se pagó extrayendo: `CadToolPalette` y `CadDiagnosticsReadout` salieron
fuera del archivo.

### GOLDENS — qué se rompió y qué no

Corrida completa tras la ola 5: **75 de 87 verdes, 12 rojos.** De esos doce:

**Seis eran rojos antes de esta campaña** (21-xrefs, 47-lisp-appload, 47-solids,
53-bim-wall, 54-bim-wall-joins, 55-anchored-comments): comprobado con `git stash`
y corrida de control ya en la ola 1.

**Cuatro regresaron por la sesión paralela** (17-mleader, 46-pointer-engine,
51-style-manager, 56-tableta). Comprobado con una corrida de CONTROL sobre HEAD
con mi ola 5 guardada: los cuatro fallan igual sin mis cambios — y
46-pointer-engine falla ahí en DOS pruebas en vez de una. Sus aserciones son de
dominio CAD, no visuales.

**Dos eran míos, y los dos por la misma causa.** `13-cad-dynamic-input` y
`26-cad-precision-polyline` afirmaban `getByText(/0 equipos/)` VISIBLE, y la ola
5 quitó ese contador de la barra superior. **La afirmación de fondo es buena**
—dibujar geometría canónica no debe crear un objeto heredado por la puerta de
atrás— así que no se borró: el contador vive ahora en el bloque de diagnóstico
con `data-testid="cad-legacy-asset-count"`, y la aserción apunta a ese gancho
estable en vez de a una expresión regular sobre el texto de la página. **Es más
precisa que antes.** Los dos verificados verdes.

### CIERRE DEL INVENTARIO DE CSS

La ola 0 marcó cada bloque no consumido con la ola que iba a cablearlo. Balance
final: **cableados** `.aurora-bg`, `.mission-grid`, `.hero-conic`, los tres
`.hero-orb`, `.product-halo`, `.float-slow` y la escala entera. **Eliminados**
`.premium-glass`, `.apple-card`, `.glass`, `.valle-blob-*`, `.valle-noise`,
`.text-gradient-title`, `.transition-smooth` y los siete tokens `--apple-*`.

No se quedaron sin cablear por falta de tiempo: al llegar a su ola resultaron
REDUNDANTES —tres variantes del mismo material translúcido para un sistema que ya
resuelve esa superficie con `bg-popover` + `border-border` + `shadow-floating`, y
que además gira sola con el tema, cosa que ninguna de las tres hacía—. Dejarlas
«marcadas para más adelante» habría sido mover el problema.
`globals.css`: 1 001 → 832 líneas.

**PENDIENTE AJENO:** el gate del monolito está rojo porque
`lib/cad/commands/parser.ts` CRECIÓ de 1 620 a 1 685 líneas. Es archivo de la
sesión paralela y `--allow-growth` es una decisión suya, no mía. Igual que
`asset-catalog.spec.ts` y `nl-quality.spec.ts`, rojos por su retirada de
vocabulario industrial en vuelo.
