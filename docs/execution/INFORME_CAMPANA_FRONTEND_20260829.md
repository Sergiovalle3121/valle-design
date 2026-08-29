# Informe — Campaña de ingeniería frontend

**Fecha:** 2026-08-29 · **Repositorio:** `valle-design` ·
**Rama:** `claude/valle-design-premium-identity-4hnemt` · **Base:** `main @ ad3c32a`

La bitácora por olas está en [`CAMPANA_FRONTEND_20260829.md`](CAMPANA_FRONTEND_20260829.md).
Esto es el resumen: qué se decidió, qué se midió, qué quedó fuera y qué sigue.

---

## 1. Las decisiones, y por qué

| Decisión | Veredicto | Razón, en una línea |
| --- | --- | --- |
| **React Compiler** | **NO** | No mejora nada medible y cuesta +58 KB en el estudio y +66 % de build. |
| **Store ligero (zustand)** | **NO** | La condición era que el prop-drilling doliera al extraer. No dolió: siete cuadros salieron con 2-22 props. |
| **Radix** | **NO hizo falta** | El barrido no encontró ningún overlay propio irreparable; lo que faltaba —rol, título, Escape— se arregló en un marco común propio. |
| **Umbral móvil de Lighthouse** | **Fijado en 0,70 y bloqueando** *(cerrado tras el informe)* | Medido en el runner: 73 / 74 / 75. No se pone en 90 porque el producto no está en 90; bajar el listón en silencio no vale y dejarlo en aviso tampoco. Lo que hay que adelgazar es P1-FE6. |
| **Meta del monolito (< 18 500 líneas)** | **No alcanzada** | Se bajó 1 083 líneas; forzar el resto habría producido un componente de 40 props, que es el monolito con otra sintaxis. |

### React Compiler, con los números delante

Evaluado tras flag (`VALLE_REACT_COMPILER=1`), medido sobre el mismo código:

| Medida | Sin | Con | Δ |
| --- | ---: | ---: | ---: |
| JS de la landing | 811,6 KB | 795,1 KB | −16,5 KB |
| JS del estudio | 3 835,8 KB | 3 893,8 KB | **+58,0 KB** |
| Estudio usable | 1 418 ms | 1 473 ms | +55 ms |
| Compilación | 14,5 s | 24,0 s | **+66 %** |
| Interacción p50/p75/p95 | 152/160/**168 ms** | 152/160/**168 ms** | **0** |

No rompe goldens (13 pruebas del editor pasan con él encendido). Pero el criterio era «se adopta sólo
si **mejora**», y no mejora. **Y se sabe por qué:** la latencia del estudio en esta máquina la domina
el rasterizado WebGL por software y el pipeline de escena, no el trabajo de React. Además, el ESLint
del propio compilador cuenta 164 avisos `react-hooks/refs` concentrados en el editor — cada uno un
punto donde el compilador se desactiva o memoiza algo que el código muta por debajo. Se reevalúa
cuando esos avisos bajen, es decir, cuando avancen las extracciones de `DEUDA-MONOLITO.md`.

---

## 2. La tabla antes/después

**Condiciones, declaradas:** contenedor efímero de Claude Code on the web, 4 núcleos, 15 GiB,
Node 22.22.2, Next 16.2.12, build de producción con `NEXT_PUBLIC_API_URL=http://localhost:4010`,
Chromium de Playwright headless con WebGL por software, red local sin latencia.
**Son techos, no marcas.** Las metas de CI se fijaron con margen sobre esto.

| Medida | Antes | Después | Δ |
| --- | ---: | ---: | ---: |
| `/` primera carga (gzip) | 284,9 KB | 286,7 KB | +1,8 KB |
| `/register` | 284,7 KB | 287,4 KB | +2,7 KB |
| `/dashboard` | **430,1 KB** | **305,2 KB** | **−124,9 KB (−29 %)** |
| chunks de `/dashboard` | 22 | 19 | −3 |
| fuente exclusiva del tablero | 1 577,9 KB | 132,5 KB | **−92 %** |
| JS del estudio (bruto, distinto) | 4 019,3 KB | 3 835,8 KB | −183,5 KB |
| Estudio usable | 1 486 ms | 1 418 ms | −68 ms |
| Interacción p95 (denso) | — | 168 ms | primera medida |
| Violaciones axe serias | **8** (de 18 casos) | **0** | −8 |
| `Layout3DEditor.tsx` | 20 220 líneas | **19 137** | **−1 083** |
| `useState` del editor | 140 | 140 | 0 |
| Avisos de lint (`apps/web` + `apps/api`) | 547 | 545 | −2 |
| Lighthouse escritorio (rendimiento) | — | 93 / 94 / 95 | primera medida |
| Lighthouse escritorio (accesibilidad) | — | 100 / 100 / 100 | primera medida |

> La subida de ~2,7 KB en las rutas públicas es el coste de `ErrorBoundary`, que se exporta desde el
> barril de `components/ui` —la convención del repo— y por eso la pagan todas. Se paga a sabiendas:
> romper la convención para ahorrar 2,7 KB sería un mal cambio, y lo que importa es que el gate lo
> hizo visible en vez de dejarlo pasar.

### La suite, con la máquina limpia

**126 pasados · 2 fallidos · 11 omitidos · 36,5 min** (goldens + accesibilidad + rendimiento +
públicas + comerciales + tablero, sobre el build de producción).

Los dos fallos, sin adornos. El primero **es mío**: el techo de latencia de interacción estaba
calibrado con la medida *aislada* (168 ms) y la corrida en suite da 224 — la misma prueba, en una
máquina que acaba de correr cien más. El gate corre en suite, así que el número de la suite es el que
manda; recalibrado a 320 ms con las tres medidas escritas en el JSON. El segundo,
`56-cad-tableta-en-obra`, **no reproduce solo**: vuelto a correr en aislamiento sobre el mismo build,
pasa. No se marca como flaky ni se toca; se declara lo que se sabe y CI —con `retries: 1` y un runner
dedicado— es el árbitro.

Sobre el árbol final, tras dividir el tablero: 27/27 en accesibilidad, teclado, carga, interacción y
los dos E2E del tablero. Y todos los gates del repositorio en verde, incluidos los **761 casos de
matemática con 0 desviaciones**.

---

## 3. Los gates nuevos

| Gate | Qué mide | Dónde corre | Bloquea |
| --- | --- | --- | --- |
| `scripts/perf/bundle-budget.mjs` | JS de primera carga por ruta, en gzip, leyendo los `<script src>` del HTML servido | `quality-gates`, tras el build | Sí |
| `e2e/performance/frontend-load-budget.spec.ts` | JS distinto que el navegador NECESITA hasta que la pantalla es usable | suite E2E | Sí |
| `e2e/performance/interaccion-estudio.spec.ts` | Latencia de interacción (p95 y peor) con la API que define INP | suite E2E | Sí |
| `e2e/a11y/axe-superficies.spec.ts` | axe-core sobre 9 superficies × 2 temas | suite E2E | Sí (serias/críticas) |
| `e2e/a11y/teclado-embudo.spec.ts` | Recorrido con teclado, trampa de foco, Escape, foco visible | suite E2E | Sí |
| `src/components/ui/primitives-contract.spec.ts` | Roles, nombres accesibles y estados de las primitivas | `test:specs` | Sí |
| `src/lib/commercial/oferta-un-solo-origen.spec.ts` | Que la duración de la oferta no tenga un segundo origen | `test:specs` | Sí |
| `npm run check:lighthouse` | Rendimiento, accesibilidad, LCP, CLS, TBT — escritorio y móvil | `quality-gates` | Escritorio sí; móvil, aviso |

Todos los presupuestos son **trinquetes** con el patrón del repo: el número sólo baja, y subirlo exige
editar el JSON a mano y explicarlo en el commit.

---

## 4. Los defectos que aparecieron, y cómo se cerraron

**Ocho violaciones serias de contraste, y un gate que no podía verlas.** `check:contrast` medía 35
pares y estaba verde; `contrast.mjs` sabía componer sobre el fondo desde el primer día. Pero ningún
par declaraba una atenuación, así que la tinta se medía a opacidad plena: 7,10:1 sobre el papel,
3,10:1 en pantalla con `opacity-60` encima. El gate no estaba roto — estaba **incompleto**, y de la
peor manera. Se corrigió el color (`opacity-85`, y sin atenuación donde la tinta ya era la atenuada
del sistema) **y el metro**: `PAIRS` gana un campo `alfa` y mide el color compuesto. 76 pares.

**El diálogo de comentarios se comía lo que el usuario escribía.** `Modal` montaba su efecto de foco
con `onClose` en las dependencias, y los consumidores pasan una función nueva en cada render: el
efecto se remontaba y movía el foco al primer control con **cada tecla**. En el único canal que el
producto tiene para que alguien cuente que algo se rompió. Corregido con el patrón del ref, y
**verificado por mutación**: con el código anterior, el test pierde el texto.

**Un fallo de carga del tablero tumbaba la ruta entera — y el gate de accesibilidad lo tapaba.** El
`TypeError` se producía dentro de un actualizador perezoso de `setState`, que corre después, fuera
del `try`, así que escapaba a la frontera de ruta. Y la spec de axe esperaba a `h1, h2` antes de
auditar: **la pantalla de error también tiene un `h1`**, de modo que axe auditaba la pantalla de error
y pasaba en verde. Se arreglaron las tres capas: la lectura dentro del `try`, la spec comprobando que
no está en la frontera de error y que la página no soltó errores, y un fixture que da a las pruebas
un tablero con datos de la forma correcta.

**El contexto WebGL se podía perder en marcha sin que nadie se enterara.** El editor trataba bien
«este navegador no da WebGL», pero no «el driver se reinició»: el bucle seguía llamando a `render()`
sobre un contexto muerto y el lienzo se quedaba **congelado con el último fotograma**, sin error,
mientras el resto de la interfaz respondía. El usuario editaba encima de un plano que ya no veía.
`guardCadWebglContext` lo detecta, cancela el evento —sin eso el navegador nunca restaura— y el telón
dice la verdad de cada caso. Golden nuevo y spec verificada por mutación.

**El tablero descargaba el importador entero para pintar una lista.** 1 577,9 KB de fuente exclusivos:
importador DXF, puente DWG, lector de shapefiles, lector de nubes de puntos LAS, proyecciones
cartográficas y el catálogo entero de plantillas. Tres costuras, las tres ya dentro de un `async`.

---

## 5. Lo que no se hizo, dicho por su nombre

| Qué | Por qué |
| --- | --- |
| **Entrar con Google** (OLA 6.1) | No cabía. Es una campaña, no un ítem: fusión de cuentas, verificación heredada, revocación, segundo factor. El terreno queda **mapeado** en `BACKLOG.md` P1-F3 con la anatomía exacta de la sesión de hoy. |
| **Monolito < 18 500 y `useState` < 130** | Se bajó 1 083 líneas. El resto exige controladores de estado antes que extracciones de vista; el mapa medido está en `DEUDA-MONOLITO.md` y la entrada en `BACKLOG.md` P1-FE2. |
| **Web Vitals de campo** (OLA 2.4) | El medidor existe y tiene spec; falta la cadena servidor entera (entidad + migración + controlador + contrato + SDK, con biyección exacta exigida por `check:cad-contract`) y una decisión de producto sobre un endpoint de escritura sin sesión. P1-FE3. |
| **Umbral móvil de Lighthouse** | ~~P1-FE1~~ **cerrado el mismo día**, después de arreglar cuatro fallos encadenados en la cadena de publicación de la medida. Los cuatro umbrales de las dos pasadas bloquean con el número del runner delante. |
| **Trampa de foco en los cuadros del estudio** | `CadDialogShell` da rol, título y Escape —que no tenían— pero no mueve el foco. Hacerlo a medias es peor. P1-FE4. |
| **Virtualizar listas** (OLA 2.2) | La medición no lo señaló como el cuello: la latencia la domina el rasterizado. Virtualizar sin que la medida lo pida es optimizar a ciegas. |

---

## 6. Una lección de método que costó horas

Dos corridas completas de la suite de navegador salieron rojas —10 fallos una, 4 la otra— **por mi
propia gestión de procesos, no por el producto**:

1. `reuseExistingServer` de Playwright reutiliza cualquier `next start` vivo en el puerto. Si ese
   servidor es de un build anterior, sirve HTML que referencia chunks que ya no existen: el navegador
   recibe un 500, lanza `ChunkLoadError` y la frontera de error sustituye la página. Rojo que no
   tiene nada que ver con el código.
2. Mis propios scripts de medida dejaban servidores huérfanos: `npx` lanza `next start`, que lanza
   `next-server`, y matar sólo al hijo directo deja al nieto escuchando. **Veintiocho** servidores
   sobrevivieron a una tarde de medidas.

Ambos arreglados (`detached: true` + matar el grupo de procesos), y anotados aquí porque la conclusión
importa más que el arreglo: **un rojo hay que atribuirlo antes de creerlo.** Reconstruir y volver a
medir con la máquina limpia cambió el veredicto de «diez goldens rotos» a «cero».

---

## 7. Los diez siguientes

1. ~~**P1-FE1**~~ — **hecho**: los cuatro umbrales bloquean con la medida del runner. En su lugar entra **P1-FE6** — adelgazar la portada, donde el 74 % de los bytes son tipografías (1 093 de 1 476 KB) y tres de las cinco van en TTF sin convertir. Es lo que sube el 73 móvil.
2. **P1-FE4** — trampa de foco en `CadDialogShell`, copiando lo que `Modal` ya hace bien.
3. **P1-FE2 (a)** — `usePaperSpaces`: el controlador que desbloquea el cuadro de 525 líneas.
4. **P1-FE2 (b)** — los otros tres controladores (DXF, versiones, validación): ~23 `useState`.
5. **P1-FE3** — la cadena de Web Vitals de campo, con su decisión de producto delante.
6. **P1-F3** — Entrar con Google, como campaña propia, con el mapa que deja este informe.
7. **P2-FE5** — diferir los manejadores de comandos pesados para sacar `templates.ts` del editor.
8. Reevaluar el React Compiler cuando los avisos `react-hooks/refs` del editor hayan bajado.
9. Extender axe al **estudio** (hoy cubre embudo y cuenta; el editor necesita su propio guion).
10. Ruta interna `/sistema` como living styleguide y superficie para axe y goldens visuales (R.1 de la
    cola de reserva; no se llegó).

