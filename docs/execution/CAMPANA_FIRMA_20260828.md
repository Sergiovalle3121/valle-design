# Campaña de firma propia — estética ultra premium, seguridad de cuenta y comunidad

**Fecha:** 2026-08-28 · **Base:** `main @ a7a33d8` · **Rama:** `claude/valle-design-premium-identity-4hnemt`

## El veredicto del dueño (el encargo)

> «Muy minimalista, le falta vida, movimiento y contraste; no siento que sea MI
> producto — parece heredado; quiero algo ultra premium con mi propia firma,
> inspirado en la estética de un CAD profesional pero mío».

Y con él, cinco encargos concretos: (1) que la página no se presente como «el que
compite con AutoCAD»; (2) que la creación de cuenta sea lo más segura Y lo más
bella posible; (3) más información real para el cliente (FAQ de verdad); (4) un
canal donde los usuarios reporten fallas y sugerencias desde dentro del producto;
(5) sembrar el terreno para un modo universitario gratuito.

## La dirección de arte

Lenguaje **«instrumento profesional»**: la mesa de un dibujante de noche.
Fondo carbón profundo (grafito con temperatura, no negro puro), geometría
brillando encima, retícula técnica sutil, acentos que cortan como plumilla.
Vocabulario: retícula de plano como textura, líneas de construcción y marcas de
referencia como motivo gráfico, **el trazo que se dibuja solo**
(`stroke-dashoffset` animado) como firma de movimiento, numeración y cotas como
detalle tipográfico.

**Límite legal absoluto:** inspirarse en las convenciones del CAD profesional
(fondo oscuro, densidad, precisión) está bien. Imitar la imagen comercial de
Autodesk está prohibido — ni su rojo corporativo, ni su tipografía de marca, ni
composiciones que evoquen su identidad, ni la palabra AutoCAD en el branding.

## Reglas de no-detención

1. Nunca preguntar; decidir, bitacorear, seguir. Ítem bloqueado >25 min → backlog.
2. Esta bitácora se actualiza por ítem. Si el contexto se compacta, se relee primero.
3. Tras cada ola: suite completa + goldens con árbol quieto + push.
4. Todo cambio visual pasa por los tokens (`globals.css` + `components/ui`). Cero hex sueltos.
5. Contraste AA ≥ 4.5:1 medido con gate; todo movimiento respeta `prefers-reduced-motion`;
   ningún `data-testid` cambia; los 761 casos de matemática y la Jornada Real intactos.
6. El canvas NO cambia sus colores de datos (ACI es información del plano).
7. Ningún claim nuevo: el gate de honestidad DWG y el tono siguen mandando.

## Cola de la campaña

| Ola | Ítem | Estado |
| --- | --- | --- |
| 0 | 0.1 Paleta v2 oscura por defecto | **hecho** |
| 0 | 0.2 Tipografía display con carácter | **hecho** |
| 0 | 0.3 Sistema de movimiento tokenizado | **hecho** |
| 0 | 0.4 Textura técnica (retícula, marcas de esquina) | **hecho** |
| 0 | 0.5 Primitivas `components/ui` a la identidad nueva | **hecho** |
| 1 | 1.1 Hero con el plano dibujándose | **hecho** |
| 1 | 1.2 Secciones con profundidad | **hecho** |
| 1 | 1.3 FAQ de verdad (20+ preguntas, categorías, buscable) | **hecho** |
| 1 | 1.4 Precios v2 + días de prueba desde configuración | **hecho** (la cifra ya salía de configuración: premisa corregida) |
| 1 | 1.5 Reposicionamiento legal + gate de superficie | **hecho** |
| 1 | 1.6 Móvil a la misma altura | **hecho** |
| 2 | 2.1 Registro y login premium | pendiente |
| 2 | 2.2 Entrar con Google y Microsoft | pendiente |
| 2 | 2.3 MFA opcional (TOTP) | pendiente |
| 2 | 2.4 La cuenta muestra su seguridad | pendiente |
| 2 | 2.5 Verificación por enlace pulida | pendiente |
| 3 | 3.1 Nombres humanos de entidades | pendiente |
| 3 | 3.2 Primera impresión en 2D | pendiente |
| 3 | 3.3 Cromo del estudio con la identidad nueva | pendiente |
| 3 | 3.4 Microfeedback de acción | pendiente |
| 3 | 3.5 Regenerar capturas | pendiente |
| 4 | 4.1 Centro de comentarios en el producto | pendiente |
| 4 | 4.2 Panel de administración de comentarios | pendiente |
| 4 | 4.3 `/novedades` | **hecho** |
| 5 | 5.1 Plan educativo tras flag | pendiente |
| 5 | 5.2 El aula como organización | pendiente |
| 5 | 5.3 `/educacion` | **hecho** |
| 5 | 5.4 Qué faltaría para encenderlo | pendiente |
| F | F.1 Suite + Jornada Real + goldens + push | pendiente |
| F | F.2 Gate de contraste + gate de superficie + antes/después | pendiente |
| F | F.3 Informe de cierre | pendiente |
| F | F.4 BRAND.md y DESIGN_SYSTEM.md actualizados | pendiente |

## Bitácora

### 00:00 — Arranque

Repositorio en `main @ a7a33d8`, árbol limpio, rama de campaña creada.
Reconocimiento inicial: `globals.css` (831 líneas, tokens semánticos HSL con
`.dark` como inverso fiel del claro), 12 primitivas en `components/ui`, gate
`design-system.spec.ts` con siete reglas, portada de 642 líneas con capturas
reales del producto.

**Hallazgo que corrige el encargo:** el gate de contraste AA «que ya existe» NO
existe — `grep` sobre `scripts/` y `components/ui` no encuentra ningún cálculo de
luminancia relativa ni umbral 4.5:1. Se construye en esta campaña (F.2) en vez de
darlo por hecho.

### 01:10 — OLA 0 cerrada: la firma existe y está medida

**0.1 · Paleta v2.** Sustrato de **grafito cálido** (`#0c0b0b` oscuro / `#f7f5f2`
claro) con acento **violeta eléctrico** (`#8c73fc` / `#6b4def`), ámbar de
plumilla y verde de confirmación. La decisión de fondo: la v1 era un claro de
banca con un oscuro que era su *inverso fiel* — coherente y anónimo. La v2 elige
una temperatura (cálida abajo, fría en el acento) y la sostiene en los dos modos.
El oscuro deja de ser una cortesía nocturna y pasa a ser el DEFAULT del producto
(`layout.tsx` + `ThemeContext`); `system` sigue existiendo pero ahora se pide.

Relieve: el fondo oscuro baja a 4,5 % de luz y la tarjeta sube a 11,5 % —siete
puntos donde la v1 tenía tres— y las sombras oscuras estrenan un `inset` de luz
en el canto superior, que es lo que de verdad separa planos sobre casi-negro.

**El hallazgo que corrigió el encargo.** La instrucción decía «medido con el gate
que ya existe». No existía. Lo que había eran números medidos a mano en los
comentarios de `globals.css` (4,46:1 · 5,38:1 · 3,02:1), correctos y sin nada que
los volviera a comprobar. Se construyó:

* `scripts/design/contrast.mjs` — la aritmética WCAG 2.1 sin dependencias.
* `scripts/design/check-contrast.mjs` — **35 pares por tema, 70 en total**, con
  tres umbrales: 4,5:1 texto, 3:1 gráfico y 1,3:1 *relieve* (criterio propio: la
  queja era «le falta contraste» y en oscuro eso casi nunca es el texto, es que
  los planos no se separan).
* `scripts/design/check-contrast.spec.mjs` — 10 pruebas, incluida la que casi
  nunca se escribe: que el gate DETECTE una paleta ilegible.

El gate cazó dos fallos del primer corte antes que el ojo: el borde claro a 87 %
de luz no despegaba la tarjeta del fondo (1,23:1) y el hover de marca en oscuro
caía a 4,21:1 con letra blanca. Los dos corregidos moviendo el token.

**0.2 · Tipografía.** Display nueva: **Space Grotesk** (OFL 1.1, autohospedada,
`SpaceGrotesk-wght.ttf`, 136 KB). El argumento no es estético: es la hermana
*proporcional* de una monoespaciada, así que comparte esqueleto con la mono que
ya compone cotas, coordenadas y línea de comandos — la marca pasa a tener UNA voz
en dos anchos. Sólo la consumen `display`, `title` y `heading`; el cuerpo sigue en
Inter porque hay documentación que se lee de verdad. Titulares más grandes y más
densos: techo de 68 → 84 px, interlínea 1,04 → 0,98. Escalón nuevo
`.type-sheet-number` (numeración de lámina). `check:fonts` ya exige el archivo.

**0.3 · Movimiento tokenizado.** Tres curvas (`expo`, `spring`, `draw`) y seis
duraciones con nombre de trabajo, no de tamaño (`instant` 90 ms … `draw` 2600 ms),
más cinco clases `.motion-*` para que nadie vuelva a escribir `duration-200` a
mano. Y la firma: `.stroke-draw` / `.stroke-draw-loop` — `stroke-dashoffset`
animado sobre `pathLength="1"`, escalonado con `--draw-delay`.

**El defecto que la regla general escondía.** `prefers-reduced-motion` aplasta la
duración a 0,001 ms y deja cada animación en su fotograma final. Para el bucle del
trazo ese fotograma es el plano **borrado**: quien pide menos movimiento se habría
quedado mirando un lienzo en blanco. Excepción explícita añadida y comentada.

**0.4 · Textura técnica.** `.blueprint-grid` (dos frecuencias, 8 px y 64 px, la
convención del papel milimetrado), `.corner-marks` (marcas de escuadra en un
`::before` con `pointer-events: none`), `.construction-line` y su vertical.
CSS puro, cero imágenes.

**0.5 · Primitivas.** `shadow-control` (filo de luz + sombra) y
`active:translate-y-px` en botón primario y destructivo: un control que se pulsa
hace dos cosas a la vez, y ese par es lo que separa un rectángulo de color de una
tecla. `Surface` estrena `texture` (`none` · `corners` · `grid`) y levita medio
píxel al pasar el puntero cuando es pulsable. Los campos estrenan `focus-glow`.

**Activo nuevo:** `components/brand/PlanDrawing.tsx` — una planta arquitectónica
completa (muros dobles, vanos, puertas con barrido, mobiliario, escalera, cotas
con marcas oblicuas y cajetín) que se traza sola en el orden del oficio. Cero
JavaScript en el cliente: componente de servidor y animación entera en CSS.

**Verdad medida:** `432/432` specs verdes · `check:contrast` 70 pares OK ·
`check:fonts` OK · `tsc --noEmit` limpio.

**Zona de roce anotada:** `apps/web/src/app/page.tsx` queda ROJO a propósito en
`check:surface` — el gate de superficie ya existe y la portada todavía nombra a
la competencia. Es el primer ítem de la OLA 1.

### 02:40 — OLA 1 cerrada: la portada dejó de compararse y empezó a moverse

**1.5 · Reposicionamiento, primero porque bloqueaba.** Fuera de la superficie
pública las comparaciones: el hero decía «una alternativa a AutoCAD en la nube» y
ahora se describe solo; el límite de DXF dice «la versión AC1015» en vez de
nombrar la versión por su marca; la capacidad de automatización pasa a
«Automatización con LISP en el navegador», descrita como el dialecto LISP del
dibujo técnico. La línea de marcas se conserva —el producto lee DXF y esos
nombres viven en la documentación técnica— pero **extraída a
`components/marketing/TrademarkNotice.tsx`**, para que el gate tenga UN archivo
que permitir en vez de una excepción por página.

`scripts/design/check-public-surface.mjs` vigila 19 zonas públicas. Quita
comentarios antes de mirar (el gate juzga lo que el usuario lee, no lo que el
equipo escribe para entenderse) y comprueba las dos mitades: que las marcas no
aparezcan fuera del módulo autorizado **y que el aviso siga montado**. Un gate
que sólo prohibiera se satisface borrando el aviso legal.

**1.1 · El hero se mueve.** `PlanViewport` + `PlanDrawing`: una planta que se
traza sola, dentro de una lámina con su numeración y su cajetín. No finge ser la
aplicación —sin barra de ventana ni paletas falsas— porque una interfaz dibujada
a mano que imita el producto es una mentira barata. Las capturas reales del
editor siguen justo debajo, que es donde tienen que estar.

**Defecto cazado antes de publicarlo:** el halo del visor mide 40 puntos más que
la figura por cada lado, exactamente el defecto que el marco del producto ya
pagó una vez (la portada entera se desplazaba en horizontal en un teléfono de
390). Resuelto con `overflow-x-clip`, el único valor de CSS que permite recortar
un solo eje: corta el sangrado lateral y deja el resplandor arriba y abajo.

**1.2 · «Así se siente».** Tres microdemos animadas (`FeelDemo.tsx`) de lo que
una captura no puede contar: la referencia que imanta al punto exacto, la cota
que nace amarrada, la lámina que sale con el tamaño de página exacto. SVG de 2 KB
que heredan el tema, no GIF de megabytes que envejecen en silencio.

**1.3 · Centro de preguntas.** De 7 a **36 preguntas en 6 categorías**, con
buscador que mira dentro de las respuestas (quien teclea «Argon2» o «CFDI» no
está escribiendo el título de ninguna pregunta) y que normaliza los acentos
(«facturacion» encuentra «facturación»). Sin resultados nunca hay callejón sin
salida: se ofrece soporte, porque la pregunta que nadie previó es justo la que
hay que poder hacerle a una persona.

El texto vive en `lib/marketing/faq.ts` y de ahí sale también el JSON-LD: lo que
ve Google y lo que lee una persona son literalmente el mismo párrafo.
**`public-pages.spec.ts` se amplió para cubrir ese módulo** — si se hubiera
quedado mirando sólo `page.tsx`, la regla de honestidad habría seguido en verde
mientras 36 respuestas nuevas podían prometer lo que quisieran.

**1.4 · La premisa del encargo estaba vencida.** El encargo decía que la portada
dice «14 días gratis» cableado. No: la campaña de lanzamiento ya lo había
resuelto. `TRIAL_DAYS` → catálogo público de la API → `FreeLaunchNote` (portada
y alta) y `PricingCatalog` (precios); el panel usa `TrialBanner` sobre el estado
real de la suscripción. **Verificado, no reescrito.** El único `14` que queda es
`EXPIRY_NOTICE_DAYS`, que es otra cosa: cuándo empieza el aviso de vencimiento.

**Ambiente tokenizado — el hex que sobrevivió a la campaña anterior.** Las capas
atmosféricas (aurora, orbes, malla cónica, halo) llevaban el índigo de la v1 en
SEIS `rgba()` escritos a mano dentro de la hoja. Sobrevivieron porque el gate del
sistema prohíbe el hex en los COMPONENTES y éstos vivían en el CSS, su único
hueco legal — así que seguían pintando el acento viejo con la paleta ya
cambiada. Ahora son `--ambient-tint*`, `--halo-tint` y `--conic-tint` con tema, y
`.dark .aurora-bg` desapareció por innecesario. **La regla que queda escrita: si
un color se repite en la hoja, es un token; «está en globals.css» no basta.**

**Dos páginas públicas nuevas** (adelantadas de las olas 4 y 5 porque el centro
de preguntas ya enlazaba a ellas): `/novedades`, alimentada por un módulo simple
de ocho entradas fechadas y en producción, sin hoja de ruta a propósito; y
`/educacion`, que cuenta lo que un taller puede hacer HOY y dice con todas las
letras que el plan educativo gratuito todavía no está abierto. Las dos en el
sitemap, en la barra pública y en el pie.

**Verdad medida:** `432/432` specs verdes · `build` verde · `check:contrast` 70
pares OK · `check:surface` OK · trinquete de lint 547/547 · `tsc` limpio.
