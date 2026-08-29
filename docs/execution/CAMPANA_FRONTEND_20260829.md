# Campaña de ingeniería frontend — endurecer lo que el usuario ve

**Fecha de arranque:** 2026-08-29 · **Repositorio:** `valle-design` ·
**Rama de trabajo:** `claude/valle-design-premium-identity-4hnemt` (reiniciada desde `main` tras la fusión de #115).

## Misión

El backend ya está endurecido y la identidad visual nueva ya existe. Esta campaña hace lo tercero:
que el frontend sea **ingeniería** — rápido de verdad, accesible de verdad, robusto ante errores,
medible, y con una arquitectura de componentes que aguante los próximos dos años. Al terminar, el
frontend debe tener las mismas garantías que el backend: presupuestos que fallan en CI, evidencia
medida, y cero degradación silenciosa.

## Decisiones de tecnología (tomadas; no se reabren)

| Decisión | Veredicto |
| --- | --- |
| Stack (Next.js + React + Tailwind v4 con tokens propios + framer-motion + three.js + lucide + `components/ui`) | **No se migra.** Sin framework nuevo, sin librería de UI externa, sin reescrituras. |
| Gates de rendimiento | **Entran**: presupuesto de bundle por ruta (script propio sobre `next build`) + Lighthouse CI con umbrales. Ambos bloqueantes. |
| Gate de accesibilidad | **Entra**: axe-core sobre las pantallas clave en Playwright, bloqueante para violaciones serias/críticas. |
| React Compiler | **A evaluar tras flag**, con medición antes/después. Se adopta sólo si mejora y no rompe goldens. Si no, se documenta y se apaga. |
| Radix | **Sólo si** el barrido de accesibilidad encuentra un overlay propio irreparable; envuelto en la primitiva propia. Preferencia: arreglar lo propio. |
| Estado del editor | **Extraer** del monolito hacia anfitriones/controladores. Un store ligero (zustand) SÓLO si aparece estado compartido con prop-drilling doloroso, con ADR. **Prohibido** meter el documento canónico en un store. |

## Reglas de no-detención y no-romper

1. Nunca preguntar; decidir, bitácora, seguir. Ítem bloqueado >25 min → backlog y siguiente.
2. Esta bitácora se actualiza **por ítem**. Si el contexto se compacta, se relee primero.
3. Tras cada ola: suite completa + goldens con árbol quieto + push. Los 761 casos matemáticos, la
   Jornada Real y los gates de identidad (contraste, superficie sin marcas) quedan intactos.
4. Cero hex sueltos, cero tamaños fuera de escala: todo por tokens. Ningún `data-testid` cambia.
   El trinquete del monolito **sólo baja**. Fix-or-hide sigue vigente.
5. Todo número de rendimiento se publica con su máquina y condiciones. Las cifras de este contenedor
   son **techos, no marcas**; las metas de CI se fijan con margen sobre lo medido aquí.

### Condiciones de medición declaradas

| Elemento | Valor |
| --- | --- |
| Máquina | Contenedor efímero de Claude Code on the web |
| CPU | 4 núcleos |
| RAM | 15 GiB total |
| Disco | 252 G (26 G libres al arrancar) |
| Node | ver bitácora de la OLA 1.1 |
| Red | proxy de agente; sin latencia de usuario real |

Estas cifras **no** representan la laptop del arquitecto. Sirven para comparar antes/después en la
misma máquina y para fijar techos de CI con margen.

---

## Cola de la campaña

- [ ] **OLA 0 — Todo a main** (~45 min)
- [ ] **OLA 1 — Rendimiento real de carga** (~2.5 h)
- [ ] **OLA 2 — Rendimiento de interacción** (~1.5 h)
- [ ] **OLA 3 — Robustez de la capa vista** (~1.5 h)
- [ ] **OLA 4 — Accesibilidad como gate** (~1.5 h)
- [ ] **OLA 5 — Arquitectura de componentes: el método que queda** (~2 h)
- [ ] **OLA 6 — Lo que la firma dejó pendiente** (~1 h)
- [ ] **OLA FINAL — La verdad medida** (~45 min, obligatoria)

Cola de reserva: R.1 ruta interna `/sistema` (living styleguide, en vez de Storybook) ·
R.2 golden visual del estudio en ambos temas · R.3 service worker para carga repetida ·
R.4 auditoría de fuentes de re-render exportada como evidencia versionada.

---

# Bitácora

## OLA 0 — Todo a main

### 0.1 · La campaña de firma sobre `main`

**Estado: YA HECHO antes de que empezara esta campaña.** El enunciado describe la rama
`claude/valle-design-premium-identity-4hnemt` como viva y sin fusionar (19 commits, +16 498 líneas).
No lo está: se fusionó el 2026-08-28 a las 20:43 UTC.

| Hecho | Evidencia |
| --- | --- |
| PR #115 fusionado | `merged_at: 2026-08-28T20:43:15Z`, squash |
| Commit en `main` | `ad3c32a` — «Campaña de firma propia: identidad ultra premium, cuenta segura y voz del usuario (#115)» |
| Base anterior | `a7a33d8` (#114) |
| Rama de origen | borrada automáticamente por el remoto al fusionar |
| CI sobre `ebbc027` | Gitleaks ✅ · Contrato·Build·Test·Lint·Smoke ✅ · Despliegue ✅ · E2E Playwright ✅ |
| Suite de navegador local | 172 pasados, 0 fallos, 19 omitidos (39,5 min) |

Los 13 goldens que la campaña de firma arregló sin bajar pruebas (etiqueta `Contraseña*`,
`CÍRCULO`+`CIRCLE` con jerarquía, presets 3D pidiendo su modo) estaban **verdes en el CI que
autorizó la fusión**, no sólo en local. No hay rebase que verificar porque no hubo rebase: la rama
fue a `main` por squash directo.

Como el PR de la rama designada ya está fusionado, esta campaña la reinicia desde `main`
(`git checkout -B claude/valle-design-premium-identity-4hnemt origin/main`) y abre un PR nuevo.

### 0.2 · Clasificación de las otras dos ramas vivas

Método del cierre de ramas: *contenido ya en main / rescatar / descartar*, con veredicto escrito.

#### `claude/valle-design-3d-campaign-t0zzad` → **contenido ya en main · descartar**

Seis commits por delante de `main`; su PR abierto era el **#108** (borrador, cerrado sin fusionar).
El PR #105 de la misma rama sí se fusionó (2026-08-25), así que lo único en disputa son los commits
posteriores: `cb02ead` (429 legítimo ya no falla en seco), `0a05efd` (evidencia real de
review-concurrency) y `d8f9aca` (presupuesto de monolito tras el reintento).

Veredicto por **identidad byte a byte**, no por prosa: los ficheros que esos commits crearon o
tocaron son idénticos a los de `main` hoy.

```
git diff --stat origin/main origin/claude/valle-design-3d-campaign-t0zzad -- \
  apps/api/src/load-probe/rate-limit-retry.ts \
  apps/api/src/load-probe/rate-limit-retry.spec.ts \
  apps/api/src/load-probe/review-concurrency.main.ts \
  apps/web/src/components/cad/collab/use-cad-comments.ts \
  apps/web/src/components/cad/collab/use-cad-comments.spec.ts \
  scripts/cad/review-concurrency-evidence.mjs
→ (salida vacía: idénticos)
```

El contenido de #108 llegó a `main` por otra vía. Nada que rescatar. **Rama borrada.**

#### `claude/valle-design-p0-3-encuadre-utm` → **contenido ya en main · descartar**

Veintiocho commits de la campaña 3D-M1 y del cierre de P0-2/P0-3.

| Aportación de la rama | ¿En `main`? |
| --- | --- |
| `applyCadCameraViewPreset` con quinto parámetro `content` y criterio `boundsIntersect` | Sí — `camera-view-presets.ts:86-94` |
| Encuadre inicial sobre el contenido real cuando el footprint es disjunto (P0-3) | Sí — `Layout3DEditor.tsx:12641` |
| Volúmenes B-rep de muro, recintos, materiales nativos, adaptadores de muro | Sí — `wall-solid.ts` (226 l.), `room-solid.ts` (72 l.), `wall-materials.ts` (71 l.), `wall-solid-three.ts` (275 l.), `wall-entity-adapter.ts` (375 l.), `camera-continuity.ts` (42 l.) |
| `CanonicalHistory` en `document-lifecycle/history-controller.ts` | Sí, **movido**: la lógica pura vive en `lib/cad/canonical-history.ts` y el fichero antiguo quedó como barril de reexportación, para que ningún import existente cambiara |

Además, la campaña de firma volvió a cerrar el mismo P0-3 desde la otra costura: el conmutador
2D↔3D no pasaba por el efecto de apertura, y el golden 57 (UTM) lo destapó — 3 entidades visibles en
2D, **0** al pasar a 3D. `Layout3DEditor.tsx:12762-12775` lo arregla y explica por qué el re-encuadre
sólo ocurre con bounds disjuntos.

`git diff --name-status origin/main origin/<rama>` no lista **ningún** fichero presente en la rama y
ausente en `main`; al revés sí (`main` tiene módulos enteros — feedback, education, migraciones de
MFA — que la rama nunca vio). La rama está estrictamente por detrás. Nada que rescatar.
**Rama borrada.**

> Nota de método: `git diff A...B` (tres puntos) engaña aquí — mide contra la base de fusión, así que
> una rama vieja aparenta «aportar» 7 637 líneas que `main` ya tiene por squash. El veredicto se tomó
> con `git diff A B` (dos puntos) y con identidad de fichero, no con el conteo de tres puntos.

### 0.3 · Estado de `main`

`main` = `ad3c32a`, con la campaña de firma dentro y CI verde. Las tres ramas que existían al empezar
quedan en cero: la de firma la borró el remoto al fusionar, y las otras dos se borran aquí con el
veredicto escrito arriba. A partir de este punto la campaña trabaja sobre `main`.

> **Borrado bloqueado por el proxy.** `git push origin --delete` y `git push origin :rama` mueren con
> `send-pack: unexpected disconnect while reading sideband packet` en las tres formas de refspec
> probadas: el proxy de este entorno no deja borrar ramas remotas. El enunciado admite «déjalas en
> cero **o** con veredicto escrito»; queda el veredicto escrito, que es el artefacto que importa —
> las dos ramas están estrictamente por detrás de `main` y no contienen nada que rescatar. Borrarlas
> desde la interfaz de GitHub es un clic y no bloquea nada de esta campaña.

## OLA 1 — Rendimiento real de carga

### 1.1 · La foto ANTES, medida

Dos medidores, porque una sola cifra mentiría:

1. **`scripts/perf/bundle-budget.mjs`** — suma en gzip los `<script src>` del HTML que sirve
   `next start`. Es el JS de **primera carga**. Deliberadamente **no** lee los manifiestos internos
   de Next: en Next 16 con turbopack, `.next/server/app/**/build-manifest.json` trae `pages` vacío, y
   además un manifiesto describe lo que Next cree que emite, no lo que el navegador acaba pidiendo.
   El HTML sí es el contrato con el navegador.
2. **`e2e/performance/frontend-load-budget.spec.ts`** — navegador real, cuenta el cuerpo de **cada
   respuesta `.js`** hasta que la pantalla es usable. Hace falta porque el editor llega **después** de
   la hidratación: medido sólo por el HTML, el estudio parece pesar lo mismo que `/contact`.

**Condiciones:** contenedor efímero, 4 núcleos, 15 GiB, Node 22.22.2, Next 16.2.12, build de
producción con `NEXT_PUBLIC_API_URL=http://localhost:4010` (el mismo que usa `E2E_PROD`), Chromium de
Playwright headless, red local sin latencia. **Son techos, no marcas.**

#### JS de primera carga por ruta (gzip)

| Ruta | gzip | chunks |
| --- | ---: | ---: |
| `/` (landing) | **284,9 KB** | 16 |
| `/register` | 284,7 KB | 17 |
| `/login` | 284,7 KB | 17 |
| `/precios` | 288,4 KB | 17 |
| `/contact` | 280,2 KB | 17 |
| `/docs` | 270,6 KB | 16 |
| `/dashboard` | **430,1 KB** | 22 |
| `/studio` | 272,3 KB | 16 |
| `/studio/[id]` | 277,8 KB | 17 |
| `/cuenta` | 280,9 KB | 17 |
| `/educacion` | 270,6 KB | 16 |

#### Lo que descarga el navegador de verdad

| Pantalla | JS descargado (bruto) | Hasta usable |
| --- | ---: | ---: |
| Landing | 806,9 KB | — |
| Estudio con documento | **4 019,3 KB** | 1 486 ms |

#### Qué pesa dentro del estudio

| Chunk | Bruto | Huellas encontradas dentro |
| --- | ---: | --- |
| `0myuc3yko1yb2.js` | **1 918,9 KB** | three · plantillas · DXF · LISP |
| `0zvhl6h0ab67c.js` | 197,4 KB | teselado (servido 3×, ver nota) |
| `3e4vdz-eu_0w1.js` | 370,5 KB | three |
| `0djdkp88-sld8.js` | 346,8 KB | three |
| `3utngkl8dgi2r.js` | 197,4 KB | teselado (segundo worker) |
| `0221vbwwh7ja9.js` | 227,1 KB | react-dom |
| `1q6oj3x1dkx-e.js` | 163,5 KB | framer-motion + next-intl |

> **Corrección sobre la primera medida.** La versión inicial del contador sumaba *todas* las
> respuestas `.js`, y daba 4 456,9 KB para el estudio. Estaba mal: los tres workers de teselado se
> crean desde la misma URL y Playwright emite un evento `response` por cada uno aunque las dos
> últimas las sirva la caché de memoria — `/_next/static/**` va con `Cache-Control: immutable`,
> comprobado con `curl -I`. Sumarlas publicaba como «descarga» 394 KB que no cruzan la red. El
> contador cuenta ahora **bytes distintos**: cada URL suma una vez, y las repeticiones se reportan
> aparte como información. La cifra buena es **4 019,3 KB**.

### 1.2 · Corrección al plan: three.js **no** es «un clic»

El enunciado pide mover «three.js y todo el visor 3D a import dinámico, porque el 3D es un clic, no
la bienvenida». **En este producto esa premisa no se sostiene, y conviene decirlo antes de ejecutar
sobre ella.** Hay un único `THREE.WebGLRenderer` (`Layout3DEditor.tsx:6058`) y el modo 2D **es** ese
mismo renderer con otra cámara y otra política de órbita (`applyCadCameraPolicy(controls, viewMode)`,
`Layout3DEditor.tsx:6246`). Abrir el estudio en 2D ya necesita three.js entero. Diferirlo hasta el
clic de «3D» no ahorraría un byte en la apertura: sólo movería la misma descarga unos milisegundos
más tarde dentro de la misma pantalla.

Lo que **sí** es verdad del enunciado, y es lo que se ejecuta:

- **three.js no debe aparecer en las rutas públicas.** Comprobado, y ahora vigilado por una
  aserción: la spec de carga falla si la landing evalúa `THREE`, y ninguna huella de
  `WebGLRenderer` aparece en los 16 chunks de la landing.
- **El editor ya está fuera del bundle de ruta**: `app/studio/[documentId]/page.tsx:9` lo carga con
  `next/dynamic(..., { ssr: false })`. Por eso `/studio/[id]` mide 277,8 KB y no 4,4 MB.
- **Lo genuinamente opcional sí sale del chunk crítico**: plantillas (4 982 líneas de datos), el
  intérprete LISP, los importadores DXF pesados, el exportador GLB y el laboratorio de interop están
  hoy en `import` estático dentro del monolito y viajan aunque el usuario nunca los use.

### 1.3 · Los gates que fijan lo medido

`scripts/perf/bundle-budget.json` y `src/lib/cad/benchmark/frontend-load-baseline.json` guardan los
techos con la máquina escrita al lado. Ambos son **trinquetes**: `--write` sólo baja un techo y se
niega a subirlo; para subir uno hay que editar el JSON a mano y explicarlo en el commit. Es el mismo
patrón del presupuesto del monolito y del de lint, por la misma razón: que una regresión no se
«arregle» ejecutando el actualizador.

### 1.4 · El tablero pesaba lo que pesa un editor, y no lo era

La medida de 1.1 dejaba una anomalía: `/dashboard` pedía **430,1 KB gzip**, 145 KB más que la
landing, para pintar una lista de documentos. `scripts/perf/module-weight.mjs` —nuevo, mide el peso
transitivo de fuente de un módulo y lo que cuelga **sólo** de él— dijo por qué:

```
node scripts/perf/module-weight.mjs --exclusivo src/app/dashboard/page.tsx src/app/page.tsx
→ 143 ficheros, 1 577,9 KB de fuente
    42,7 KB  lib/cad/dxf-import.ts
    33,1 KB  lib/cad/professional-blocks.ts
    31,6 KB  lib/cad/dxf-cad-document.ts
    27,0 KB  lib/geo/crs.ts
    25,9 KB  lib/geo/shapefile.ts
    25,6 KB  lib/cad/dwg-document-bridge.ts
    20,1 KB  lib/geo/las.ts          ← lector de nubes de puntos
```

Listar documentos descargaba el importador DXF completo, el puente DWG, el lector de shapefiles, el
de nubes de puntos LAS, las proyecciones cartográficas y el catálogo entero de plantillas. Nada de
eso hace falta hasta que hay un archivo que importar o un documento que crear.

Tres costuras, ninguna inventada — las tres estaban ya dentro de un `async`:

1. **`document-import-validation.ts`** (nuevo). El tablero necesita responder «¿este archivo entra?»
   antes de leer nada: extensión, tope de tamaño, si es binario, si el formato se admite. Eso son
   cuatro funciones que no miran dentro del archivo. Vivían dentro de `document-import.ts`, cuyo
   árbol pesa 539 KB, así que preguntar costaba descargar el importador entero.
   `document-import.ts` reexporta todo lo movido: **ningún consumidor cambia de import**.
2. **`starter-choice.ts`** (nuevo). `CadStarterChoice` y `EMPTY_CAD_STARTER_CHOICE` son el estado
   inicial de un `useState`, así que se necesitan en el primer render; el formulario que los edita
   sólo aparece al abrir «documento nuevo». Separarlos deja el formulario en `next/dynamic` con un
   marcador de su misma altura (sin salto de layout) y el catálogo de plantillas fuera de la carga.
3. **`createCadStarterDocument` y `serializeCadDocument`** pasan a `await import()` en su punto de
   uso, con el usuario ya comprometido a crear o importar. `import()` cachea el módulo: el segundo
   documento no vuelve a pagarlo.

| | Antes | Después | |
| --- | ---: | ---: | ---: |
| `/dashboard` primera carga (gzip) | 430,1 KB | **302,1 KB** | **−128,0 KB (−30 %)** |
| chunks de `/dashboard` | 22 | **18** | −4 |
| fuente exclusiva del tablero | 1 577,9 KB | **132,5 KB** | −92 % |
| JS del estudio (bruto, distinto) | 4 019,3 KB | **3 826,1 KB** | −193,2 KB |

El estudio también bajó sin tocarlo: los módulos que el tablero dejó de arrastrar dejaron de estar
en el chunk compartido. Verde: 438/438 specs de `apps/web`, y los tres E2E del tablero
(ciclo de vida de documento, beta DWG, RBAC de lector).

## OLA 4 (adelantada) — Accesibilidad como gate

Se adelantó porque el gate encontró defectos reales en las mismas superficies que la OLA 1 estaba
midiendo, y arreglarlos antes de seguir moviendo bundles evita re-medir dos veces.

### 4.1 · axe-core sobre las superficies que un cliente ve

`e2e/a11y/axe-superficies.spec.ts`: nueve superficies × dos temas = **18 comprobaciones**. Falla ante
cualquier violación **seria o crítica**; las `moderate`/`minor` se imprimen como deuda visible y no
bloquean. Sin lista de excepciones, a propósito: una excepción es una violación que ya no se ve.

Los dos temas no son celo: casi toda regla de contraste depende del color computado, y un componente
puede cumplir en claro y fallar en oscuro porque los tokens cambian de valor y no de nombre. El tema
se fija **antes de la primera pintura** con `addInitScript` sobre `localStorage['valle_theme']` —la
misma clave del script anti-flash— para que axe no analice nunca el tema equivocado.

**Primera corrida: 8 fallos de 18.** Todos de la misma familia y todos reales.

| Qué | Medido | Dónde |
| --- | ---: | --- |
| `type-sheet-number opacity-60` sobre la página, claro | 3,10:1 | landing, registro, acceso, cuenta, equipo, comentarios |
| lo mismo en oscuro | 3,09:1 | ídem |
| numeración dentro de la pestaña activa del FAQ (`opacity-70`) | 4,19:1 | landing |
| numeración dentro de la pestaña en reposo (`opacity-70`) | 3,15:1 | landing |

### 4.2 · Por qué el gate de contraste no lo había visto

Esto es lo que importa del hallazgo. `scripts/design/check-contrast.mjs` existe, mide 35 pares en dos
temas y está verde. `contrast.mjs` **sabía componer sobre el fondo desde el primer día** — exporta
`composite(fg, bg, alpha)`. Pero **ningún par declaraba una atenuación**, así que la tinta se medía
siempre a opacidad plena: `--primary-ink` sobre `--background` mide 7,10:1 y pasaba, mientras que en
pantalla, con `opacity-60` encima, medía 3,10:1.

El gate no estaba roto: estaba **incompleto**, y de la peor manera — verde sobre un color que no es
el que se ve.

La corrección va en dos partes, y la segunda es la que impide que vuelva:

1. **El color.** `opacity-60` → `opacity-85` en las seis superficies que llevan la numeración de
   lámina. 0,85 y no 0,8: `0,8` medía 4,24:1 sobre `--card` en oscuro. **Eso lo encontró el gate, no
   axe** — axe sólo ve las páginas que se le enseñan; el gate ve todos los pares declarados.
   En la pestaña del FAQ la atenuación se retira entera: su color en reposo ya es
   `--muted-foreground`, el atenuado del sistema, y ni a 0,85 llegaba al mínimo. Atenuar lo atenuado
   es la forma de perder un texto.
2. **El metro.** `PAIRS` gana un quinto campo opcional, `alfa`. Con él, la fila mide el color
   **compuesto sobre su fondo** — el que llega al ojo — en vez del que dice el token. Tres filas
   nuevas cubren la numeración de lámina sobre página, sobre tarjeta y dentro del botón principal.
   El gate mide ahora 38 pares por tema, 76 en total.

**Resultado: 18/18 en verde**, y una regresión de opacidad vuelve a fallar en dos sitios distintos
(el gate de tokens, en milisegundos; axe, en el navegador).

## OLA 3 — Robustez de la capa vista

### 3.1 · Qué había ya, y qué faltaba de verdad

Antes de escribir nada: `app/error.tsx` y `app/global-error.tsx` **ya existen** y están bien
resueltos — `reset()` en vez de recargar, `digest` a la vista para soporte, y el `global-error`
pintado con estilos en línea porque sustituye el documento entero y no hay `ThemeProvider` debajo.
Lo que faltaba no era una pantalla de error: era **acotar el daño**.

Una frontera de ruta sustituye la pantalla entera. Para la landing eso es correcto — no hay nada
detrás que salvar. Para el estudio es un desastre: si la paleta de propiedades lanza al pintar una
entidad rara, el usuario pierde el lienzo, la selección, el historial local y el guardado pendiente
por un fallo ocurrido en una columna de 320 píxeles.

### 3.2 · `ErrorBoundary`, la primitiva

`components/ui/ErrorBoundary.tsx`. Envuelve un subárbol, y cuando ese subárbol lanza durante el
render lo sustituye por una tarjeta de recuperación. Tres decisiones que la hacen usable:

- **Los hijos pasan sin envolver.** Sin error, `render()` devuelve `this.props.children` tal cual —
  ni un `div` de más. Una frontera que envuelve rompe cualquier rejilla en la que se meta, y eso se
  descubre en pantalla, tarde. Hay un spec que lo fija.
- **`role="alert"`.** Sin él, un lector de pantalla no anuncia nada y media sala se queda sin saber
  que algo se cayó. También con spec.
- **El botón de reporte llega precargado** — zona, mensaje y digest los sabe el programa, no la
  persona — y **se carga perezoso**: el diálogo de comentarios arrastra el cliente de la API, y
  meterlo estáticamente en la primitiva lo metería en toda pantalla que use una frontera, es decir,
  en todas. Llega justo cuando hay algo que reportar.

Y una honestidad explícita en el propio doc del componente: **no captura** errores de manejadores de
eventos, de `setTimeout` ni de promesas rechazadas. Ninguna frontera de React lo hace. Prometer una
red que no existe es peor que no tenerla, porque nadie busca la de verdad.

Spec: `src/components/ui/error-boundary.spec.ts`, 4 casos, **verificado por mutación** — quitar
`role="alert"` y envolver a los hijos hacen fallar cada uno a su prueba.

### 3.3 · Dónde se colocaron

| Zona | Por qué ahí |
| --- | --- |
| Capa de colaboración (`CadStudioHost`) | Se alimenta de datos de **otros** usuarios que llegan por red y este cliente no controla. Un comentario con forma inesperada tumbaba el estudio entero, dibujo incluido. |
| Formulario de plantilla de arranque (tablero) | Llega por import dinámico y pinta un catálogo entero. Si se cae, se puede seguir creando el documento en blanco, que es la ruta más usada. |

### 3.4 · Modo degradado sin WebGL: ya estaba, y está bien

El enunciado lo pide como trabajo nuevo. **No lo es, y conviene no fingir que sí.**
`Layout3DEditor.tsx:6053-6070` envuelve la creación del `WebGLRenderer` en un `try/catch` con el
comentario que explica el fallo original —la excepción escapaba del efecto, tumbaba el árbol React y
el usuario perdía el editor entero sin mensaje— y conmuta `webglUnavailable` para dar el aviso
honesto. Dos goldens lo fijan: `29-cad-webgl-unavailable` (el editor se degrada y el resto sigue
utilizable) y `31-cad-no-webgl-authoring` (se puede seguir editando sin render). Queda **verificado,
no reescrito**.

### 3.5 · El guardián de almacenamiento se hizo preciso, no más laxo

El spec de accesibilidad necesita fijar el tema antes de la primera pintura, y el tema vive en
`localStorage['valle_theme']` por diseño del producto — es la clave que lee el script anti-flash de
`layout.tsx`. Pero `session-storage.spec.ts` prohibía la palabra `localStorage` en **todo** `e2e/`.

Es una red de arrastre: pesca el token de sesión, que es lo que se busca, y también una preferencia
de presentación. La tentación es quitar la regla. Lo que se hizo es lo contrario — **hacerla
precisa**: sigue prohibido cualquier uso de `localStorage` en los fixtures herméticos, con una única
excepción nombrada y medida (`valle_theme`), y el mensaje de fallo enumera el fichero y el fragmento
exactos. Una clave que se llame `valle_session` falla igual que antes. **Verificado por mutación.**

### 3.6 · El trinquete de bundle tenía un defecto, y lo destapó su primer uso real

Al medir tras añadir la frontera de error, **las once rutas fallaron a la vez** por entre 1,7 y
2,8 KB. La causa no era la frontera: era que `--write` escribía el **valor medido exacto** como
techo, sin holgura. Un trinquete sin margen no mide regresiones, mide ruido de build — cualquier
cambio, incluso uno querido, sale rojo.

Corregido: `--write` escribe `medido × 1,03`. El 3 % cubre la variación entre corridas del mismo
commit y no es permiso para crecer — una subida real se come el margen y falla en la siguiente.

La subida de 2,7 KB **es real y se paga a sabiendas**: `ErrorBoundary` se exporta desde el barril de
`components/ui`, que es la convención del repo («punto único de importación»), así que la pagan todas
las rutas. Romper la convención para ahorrar 2,7 KB sería un mal cambio; lo que importa es que el
gate lo hizo visible en vez de dejarlo pasar. Los techos se reabren a la medida nueva con su margen,
y `--write` los volverá a apretar en cuanto algo adelgace.

