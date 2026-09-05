# 18 · Diseño visual: sistema, tipografía, color, densidad, movimiento

**Auditor:** ingeniero senior externo, decisión de inversión.
**Fecha:** 2026-09-05.
**Método:** lectura del árbol real (`apps/web/src`, 192 `.tsx` + 898 `.ts` de producto),
`docs/competitive/rubric.json`, ejecución de los gates de sólo lectura
(`scripts/design/check-contrast.mjs`, `check-public-surface.mjs`,
`src/components/ui/foco-visible.spec.ts`) y cálculo de contraste con el propio
metro de la casa (`scripts/design/contrast.mjs`). No se modificó código de producto.
**Referencia de comparación:** Figma, Linear, Rhino 8, Fusion 360. No AutoCAD, que en
esta dimensión no es un listón sino un suelo.

---

## 0 · Veredicto en una frase

Valle Design tiene el sistema de diseño mejor razonado que he leído en un producto de
este tamaño —y ese sistema se queda en la puerta del estudio: el lienzo es azul marino
cuando la marca es grafito cálido, la insignia de OSNAP que el dibujante mira cada
segundo es **cian**, el color que el propio sistema prohíbe por escrito, y el aviso vivo
sobre el plano mide **1,17:1** de contraste en el tema por defecto.

**Nota: 6,5 / 10** contra AutoCAD completo.

La nota es alta y crítica a la vez, y las dos cosas son verdad:

- Contra **AutoCAD** esta dimensión gana con holgura. AutoCAD 2027 sigue siendo una
  interfaz de 1998 con tres generaciones de widgets superpuestas, iconografía
  incoherente, cuadros modales que no se redimensionan y una tipografía que hereda del
  sistema operativo. Valle tiene tokens medidos, una escala tipográfica con piso, tres
  elevaciones con nombre de intención, cinco duraciones de movimiento y gates que las
  defienden. Eso, en 2026, no lo tiene ningún CAD de escritorio.
- Contra **Figma / Linear / Fusion 360**, que es el listón que el encargo pide, pierde
  — y pierde por una razón concreta y arreglable: **el sistema cubre el marketing y la
  cuenta, y no cubre el producto**. Las cifras están en la sección 3.

Por qué no bajo más de 6,5: nada de lo que encontré es un problema de criterio. El
criterio está escrito, es bueno y está medido. Lo que falta es **alcance del gate** y
un puñado de días de trabajo mecánico. Por qué no subo más: tres de los defectos que
encontré son texto invisible en producción, en el tema por defecto, en la superficie
principal.

---

## 1 · Qué dice la rúbrica de esta dimensión, y qué encontré

La fila que toca es `recognition` — «Reconocimiento en pantalla», 14 puntos, hoy 13/14
(retiene 1 punto por falta de evidencia independiente). Su `gap` dice:

> «Lo que un dibujante de AutoCAD reconoce en los primeros cinco minutos: el texto se
> ve, la cinta está donde la espera, teclea sin pulsar la caja, arrastra para designar,
> nada le tapa el plano y los ejes se ven a trazo y punto.»

Eso es **reconocimiento**, no **diseño**. La rúbrica mide, con razón para su propósito,
que la interfaz sea *familiar*; no mide que sea *buena*. Los siete criterios de
`recognition` son todos de conformidad con AutoCAD (orden de la cinta, alias de una
letra, arrastre que designa, patrón CENTER). **Ninguna de las 36 filas de
`rubric.json` mide jerarquía tipográfica, densidad, movimiento, estados vacíos ni
consistencia de la paleta en el producto.** Esa ausencia es en sí el primer hallazgo:
lo que no se mide, se degrada, y aquí se ha degradado exactamente en la zona no medida.

Los cuatro gates que sí existen (`check:contrast`, `design-system.spec.ts`,
`foco-visible.spec.ts`, `axe-estudio.spec.ts`) están bien construidos y los ejecuté
todos. Pasan. Y con los cuatro en verde el producto tiene texto a 1,17:1 en el lienzo.
La sección 4 explica por qué, hueco por hueco de cada gate.

---

## 2 · Lo que ya está construido y está bien

Esto no es cortesía. Es la parte que un inversor debería valorar como activo real.

### 2.1 · El sistema de tokens (`apps/web/src/app/globals.css`, 1.573 líneas)

120 tokens declarados, 61 en `:root` y 43 redefinidos en `.dark`. Paleta semántica con
una dirección de arte **escrita y defendible** («la mesa de un dibujante de noche»:
grafito cálido abajo, violeta eléctrico arriba). Tres cosas que casi nadie hace:

- **Cada estado tiene dos tonos**, relleno (`--success`) y tinta (`--success-ink`), con
  la razón escrita: reutilizar el color del relleno como color de letra es la forma más
  común de fallar accesibilidad sin enterarse (líneas 82-104).
- **La sombra lleva el matiz del sustrato** (`rgba(41,30,20,…)`, no negro puro) porque
  una sombra gris-azul sobre fondo cálido se lee como suciedad (líneas 240-258).
- **El oscuro no es el inverso del claro.** El fondo baja a 4,5 % de luz y la tarjeta
  sube a 11,5 %: siete puntos de separación de plano donde la versión anterior tenía
  tres, más un `inset 0 1px 0` de filo iluminado en cada nivel de elevación (líneas
  1013-1027 del bloque `.dark`). Eso es materialidad, no glow — es la diferencia entre
  Linear y un panel de administración.

### 2.2 · El metro de contraste (`scripts/design/contrast.mjs` + `check-contrast.mjs`)

Ejecutado:

```
Gate de contraste OK: 76 pares medidos en 2 temas (38 por tema).
El par más ajustado es «la tarjeta despegada de la página» en claro: 1,09:1 sobre un mínimo de 1,05:1.
```

Un gate que convierte tokens HSL a sRGB y calcula la razón WCAG 2.1 sin dependencias,
con umbrales distintos para texto (4,5), gráfico (3,0) y relieve (1,05-1,3). Incluye el
caso que casi nadie cubre: el **relleno** de un badge también es texto cuando lleva letra
encima. Esto está por encima del estándar de la industria.

### 2.3 · La tipografía (`apps/web/src/app/fonts.css` + `src/fonts/subsets.manifest.json`)

- Tres familias con **subsetting propio** (`scripts/design/subset-fonts.py`), servidas
  desde `public/fonts/` con hash en el nombre: 547 KB en cinco caras frente a los
  1.093 KB que denuncia `P1-FE6` del BACKLOG. **Ese hueco ya está cerrado**; el backlog
  está desactualizado en ese punto.
- **Fallbacks con métricas sincronizadas** (`ascent-override`, `size-adjust` calculados
  contra Arial): el respaldo ocupa el sitio exacto de la fuente real y el `swap` no mueve
  el layout. CLS 0 por construcción, no por suerte.
- **Interletraje que se cierra con el cuerpo** (`--tracking-display: -0.038em` →
  `--tracking-body: -0.011em`) y se **afloja** por debajo de 640 px (líneas 1439-1447).
  Es la corrección tipográfica que más cambia la percepción de calidad y la que casi
  nunca se hace.
- Elección de voz razonada: Space Grotesk para display porque comparte esqueleto con la
  monoespaciada que ya compone cotas y coordenadas — «una voz en dos anchos». Es un
  argumento de diseñador, no de plantilla.
- Siete escalones (`.type-display` … `.type-micro`) con **piso duro en 11 px**, defendido
  por aserción en `src/components/ui/design-system.spec.ts` regla 2.

### 2.4 · El sistema de movimiento (`globals.css`, líneas 540-590)

Tres curvas (`--ease-out-expo`, `--ease-spring`, `--ease-draw`) y cinco duraciones, cada
una con un **trabajo** escrito, no un tamaño. Y la excepción de `prefers-reduced-motion`
mejor razonada que he visto: aplastar la animación a 0,001 ms deja `valle-stroke-cycle`
en su fotograma final, que es el plano **borrado**; el bloque de las líneas 618-632 la
cancela y fija `stroke-dashoffset: 0` a mano, porque «respetar reduced-motion no es
apagar el motor, es entregar el mismo contenido sin el movimiento».

### 2.5 · La carcasa de carga (`src/components/cad/studio/CadStudioSkeleton.tsx`)

Pinta la **misma retícula** que el editor (barra, riel, lienzo con `blueprint-grid`,
panel, barra de estado) y comunica la **etapa** en vez de un porcentaje inventado, con
`aria-busy` y `role="status"`. Cuando el editor de 3,8 MB llega, ocupa los mismos huecos:
cero salto de layout. AutoCAD enseña un splash con un logotipo. Esto es mejor.

### 2.6 · La frontera de error por zona (`src/components/ui/ErrorBoundary.tsx`)

Acota el fallo al subárbol: si la paleta de propiedades revienta, el lienzo, la selección
y el guardado pendiente sobreviven. Y declara **lo que no hace** (no captura errores
fuera del render) en vez de prometer una red que no existe. AutoCAD, en el mismo caso,
se cae entero.

### 2.7 · La línea de comandos (`src/components/cad/command-line/CadCommandLine.tsx`)

La única superficie densa del estudio que está 100 % en el sistema: `bg-popover/95`,
`shadow-floating`, `type-caption`, `LEVEL_CLASS` con `text-danger-ink` /
`text-primary-ink`, `role="log"` + `aria-live="polite"` (polite y no assertive, con la
razón escrita: un dibujante tecleando no quiere interrupciones a mitad de coordenada), y
un microcopy de placeholder que enseña («escribe un comando · Espacio repite LINE»).
Verifiqué sus pares de contraste sobre `--popover` al 95 %: 16,47 / 9,60 / 6,24 / 7,24.
Todos pasan AA holgadamente en los dos temas. **Esto es lo que debería ser todo el
estudio.**

### 2.8 · La cinta (`src/components/cad/ribbon/`)

175 iconos distintos, uno por comando, con su gate (`command-icons.spec.ts`), tooltip con
atajo, y un botón de 64 px cuyo padding está justificado por una medición (`py-0.5`
porque a 720 px de alto el lienzo necesitaba los píxeles, medido el 2026-09-02). Cada
número tiene su porqué.

### 2.9 · La marca (`src/components/brand/`)

Una geometría canónica (`logo-geometry.ts`) que alimenta componente, favicon, apple-icon,
tarjeta social y los SVG de `public/brand/`, con la regla 7 del gate impidiendo que
alguien vuelva a dibujar un logotipo a mano. Y `check-public-surface.mjs` pasa: cero
menciones de marcas ajenas fuera de `TrademarkNotice.tsx`.

---

## 3 · El hallazgo central: el sistema no llega al producto

Todo lo anterior vive, casi entero, en el marketing, el embudo de alta y el tablero.
Medido sobre `apps/web/src`:

| Medida | Público / cuenta | Estudio CAD (`components/cad`, 64 ficheros) |
| --- | ---: | ---: |
| `<Button>` del sistema | 39 usos | **6** |
| `<button>` escrito a mano | — | **280** |
| `<input>` a mano | — | **105** |
| `<select>` a mano | — | **42** |
| Ficheros que importan `@/components/ui` | — | **10 de 64** |
| Clases `motion-*` del sistema | 11 | **1** |
| `duration-150` / `duration-200` a mano | — | **7** |
| `shadow-2xl` (fuera del sistema de 3 niveles) | 0 | **17** |
| Clases `dark:` | 69 | 67 |

Y las primitivas que el gate obliga a **exportar** pero nadie **usa**:

| Primitiva | Usos en todo el árbol |
| --- | ---: |
| `EmptyState` | **0** |
| `Card` | **0** |
| `Switch` | **0** |
| `Checkbox` | 1 |
| `Modal` | 1 |
| `Tabs` | 1 |
| `ProgressBar` | 1 |
| `Spinner` | 2 |
| `Tooltip` | 3 |

La cabecera de `src/components/ui/design-system.spec.ts` lo dice mejor que yo:

> «`globals.css` llevaba 825 líneas de tokens semánticos […] y con CERO usos. Un sistema
> que nadie consume no es un sistema: es documentación.»

Es exactamente el estado en el que están hoy nueve de las quince primitivas. La regla 6
del gate sólo comprueba que el **barril las exporta**; la regla 5 sólo comprueba que cada
token aparece **al menos una vez** en algún `.tsx`. Un solo uso en la landing basta para
que el gate declare que el sistema «se consume».

Y 17 tokens de 120 (14 %) no tienen ni un consumidor: `--secondary`, `--accent`,
`--destructive` y sus seis `-foreground`, más `--surface-foreground`,
`--success-foreground`, `--warning-foreground`, `--valle-primary`, `--valle-warning`,
`--valle-danger`, `--brand-logo`, `--glass-opacity`, `--accent-strong`, `--radius-token`.
Ochenta y pico líneas de comentario razonan el par «relleno + tinta encima» de los
estados… y `text-success-foreground` / `text-warning-foreground` tienen **cero usos**:
nadie pinta nunca un badge de estado a pleno con su letra encima. El patrón real del
código es el **velo** (`bg-warning/15`), que el gate no mide. De ahí salen los tres
defectos de la sección 5.

---

## 4 · Por qué los cuatro gates están en verde con texto a 1,17:1

Éste es el hallazgo de ingeniería, no de estética. Cada gate tiene una frontera, y las
cuatro fronteras dejan fuera **la misma zona**: la superficie densa del estudio.

| Gate | Qué mira | Qué se le escapa |
| --- | --- | --- |
| `check-contrast.mjs` | 38 pares **token contra token**, sólidos | Cualquier par real del código: `bg-warning/15` + `text-gray-900`, `bg-violet-500/20` + `text-violet-100`, un hex sobre el lienzo |
| `design-system.spec.ts` | `globSync("src/**/*.tsx")` | **Todo `.ts`** — y ahí viven `live-cursor.ts`, `grip-menu-host.ts` y `collab-overlay.ts`, que son DOM imperativo por rendimiento |
| `design-system.spec.ts` regla 4 (nada de hex) | Sólo `components/ui/` y `components/brand/` | 49 hex en `.tsx` de `components/cad` y `app/` |
| `design-system.spec.ts` regla 3 (nada de cian) | Sólo `cyan|sky|teal` **como clase**, sólo en `.tsx` | `#38bdf8`, `#0e7490` escritos en hex; `bg-cyan-500` escrito en un `.ts` |
| `axe-estudio.spec.ts` | El editor **recién abierto** y el overlay de atajos | Las 14 paletas, los 8 cuadros, la insignia de OSNAP y el aviso vivo: todo lo que exige un clic o una herramienta activa |
| `foco-visible.spec.ts` | 27 `outline-none` sin sustituto (trinquete) | Correcto y honesto; es el único que declara su deuda |

La conclusión no es que los gates sean malos. Es que **el gate de contraste mide la
paleta y no la pantalla**, y que el gate del sistema mide `.tsx` en un repositorio que
deliberadamente escribe interfaz en `.ts` (con buena razón: `live-cursor.ts` explica que
un `setState` por `pointermove` reconcilia 6.000 líneas de JSX a 60 Hz). Los dos huecos
son de **alcance**, no de criterio, y los dos se cierran en un día.

---

## 5 · Defectos concretos, con fichero, línea y medida

Todas las razones de contraste se calcularon con `scripts/design/contrast.mjs`, el metro
de la propia casa, componiendo el alfa sobre el fondo que le toca a cada elemento.

### D-1 · El aviso vivo sobre el plano es ilegible en el tema por defecto — **1,17:1**

`apps/web/src/components/cad/studio/viewport-hints.tsx:44`

```tsx
className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full
           bg-warning/15 text-gray-900 type-caption font-semibold …"
```

`data-testid="cad-live-prompt"`. Es el renglón que dice «Clic en dos puntos para medir»,
«Dibujo CAD activo · clic o coordenada · Enter termina», y el que lleva la etiqueta de
OSNAP resuelta bajo el cursor. Flota sobre el lienzo.

- En **oscuro** (el tema por defecto del producto, `DEFAULT_SCHEME = "dark"` en
  `ThemeContext.tsx:75`): `bg-warning/15` sobre el sustrato deja un ámbar apagadísimo, y
  `text-gray-900` (#111827) encima da **1,17:1**. Ilegible. No es «poco contraste»: es
  texto que no está.
- En **claro** da 13,95:1. Por eso nadie lo vio: se escribió mirando el tema claro.
- **Arreglo de una palabra:** `text-gray-900` → `text-warning-ink`. Medido: **8,76:1**
  sobre el lienzo. Ya existe el token, ya está medido, ya lo usan `CadXrefPalette.tsx:40`
  y `lib/marketing/changelog.ts:41`.

Cuatro goldens dependen de este elemento (`e2e/golden/52`, `28`, `e2e/auditoria/planta`)
y ninguno mira su color: `toContainText` no ve el contraste.

### D-2 · Los pines de comentario resueltos son invisibles en oscuro — **1,62:1**

- `apps/web/src/components/cad/collab/ReviewPlanView.tsx:251` —
  `"border-emerald-200/60 bg-success/15 text-gray-950"`
- `apps/web/src/components/cad/collab/CollabThreadPanel.tsx:222` — `"bg-success/15 text-gray-950"`

Es el ordinal (1, 2, 3…) dentro de la chincheta de comentario, y es lo único que ata un
hilo del panel con su marca en el plano. Resuelto = invisible. En claro da 16,30:1.
Mismo arreglo: `text-success-ink` (7,16:1 en oscuro).

Peor: en el **enlace de revisión público** (`ReviewPlanView`), que es la pantalla que ve
el **cliente del dibujante**. La primera impresión del producto para un tercero.

### D-3 · La insignia de OSNAP —lo que más se mira del producto— es CIAN

`apps/web/src/components/cad/viewport/live-cursor.ts:57-71`

```ts
const BADGE_CLASS =
  "rounded bg-cyan-500/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-950 shadow";
const FIELD_CLASS =
  "pointer-events-none w-20 rounded border border-cyan-300/60 bg-gray-950/95 px-1 py-0.5
   text-right font-mono text-[11px] text-cyan-100 outline-none focus:border-cyan-200";
const MENU_CLASS =
  "pointer-events-auto absolute z-40 flex min-w-32 flex-col rounded-md border border-white/15
   bg-[#0b1020]/97 p-1 text-[12px] shadow-xl backdrop-blur";
const MENU_ITEM_CLASS =
  "rounded px-2 py-1 text-left font-mono text-cyan-200 transition-colors hover:bg-white/10";
```

Y lo mismo, copiado literalmente, en
`apps/web/src/components/cad/viewport/grip-menu-host.ts:22-26`, más
`"ring-2 ring-cyan-300"` en `collab-overlay.ts:249`.

Tres elementos: la **insignia de captura** que sigue al puntero, la **entrada dinámica**
(la F12 de AutoCAD) y el **menú de palabras clave** del botón derecho. Son los tres
elementos que un dibujante mira más veces por hora que ningún otro píxel de la
aplicación. Y son cian, `#0b1020` de fondo fijo, y texto a 10-12 px.

El sistema de diseño dice, textualmente, en el comentario de la regla 3 del gate:

> «Antes: 327 clases `cyan-*` en un sistema cuyo propio CSS decía "Nada de cyan" […] la
> marca cambiaba de color en el primer clic del embudo.»

La campaña limpió los 327 y la regla los prohíbe — **en `.tsx`**. Estos ocho sobrevivieron
por vivir en `.ts`. El resultado es que el producto tiene dos identidades: violeta
eléctrico en el marco, cian en la punta del lápiz.

Además: `text-[10px]` × 2 y `text-[11px]` × 4 y `text-[12px]` × 2 en estos tres ficheros.
La regla 1 del gate prohíbe `text-[Npx]` y la regla 2 fija el piso en 11 px. **10 px es
por debajo del piso que el propio repositorio declara ilegible**, y está en la etiqueta
con el nombre del compañero que colabora sobre el plano
(`collab-overlay.ts:96`) y en el ordinal de la chincheta (`collab-overlay.ts:89`).

### D-4 · El lienzo es azul marino y la marca es grafito cálido

`apps/web/src/components/cad/studio/editor-presentation.ts:21-53`

```ts
dark:   { bg: 0x0a0f1e, ground: 0x14203a, gridA: 0x2a3a5c, … }  // azul marino
light:  { bg: 0xeaf0f8, ground: 0xd7e2f1, gridA: 0x9db4d6, … }  // gris azulado
night:  { bg: 0x05070d, … }
studio: { bg: 0x202329, … }
```

Consumido en `Layout3DEditor.tsx:2324` (`sc.background = new THREE.Color(th.bg)`),
duplicado a pelo en `Layout3DEditor.tsx:5977-5980` y una tercera vez como clase
arbitraria en `Layout3DEditor.tsx:15830` (`bg-[#0a0f1e]`).

`globals.css` dedica 12 líneas a explicar por qué el sustrato es **grafito cálido y no
azul marino**:

> «El azul marino de la v1 era la decisión por defecto de todo panel de administración de
> la década. El matiz cálido […] deja al violeta del acento en tensión fría contra él,
> que es de donde sale la sensación de plumilla.»

El 90 % de los píxeles de la pantalla del estudio son el lienzo, y el lienzo es
exactamente el azul marino que el documento de dirección de arte rechaza por nombre.
Ninguno de los cuatro presets es el sustrato de la marca. Las dos mitades de la pantalla
vienen de dos programas distintos.

### D-5 · El tema de escena no se persiste y el conmutador de la app lo pisa

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:1605`

```ts
const [theme, setTheme] = useState<Theme3D>("dark");
```

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:2058-2061`

```ts
useEffect(() => {
  setTheme(resolvedScheme === "light" ? "light" : "dark");
}, [resolvedScheme]);
```

Dos defectos en cuatro líneas:

1. **No hay persistencia.** `Theme3D` no está en `CadWorkspacePreferences`
   (`src/lib/cad/cad-workspace.ts:38-55`, que sí guarda `toolbarDensity`,
   `crosshairPercent`, `pickBoxPx`, `aperturePx`, `viewMode` y hasta los atajos
   personalizados). Cada recarga del estudio devuelve el lienzo a «Oscuro».
2. **El conmutador global lo pisa.** Quien elija «Noche» o «Estudio» en el selector de
   `Layout3DEditor.tsx:15146-15155` y después toque el tema de la aplicación, pierde su
   elección sin aviso. Dos de los cuatro presets son inalcanzables de forma duradera.

En Rhino y en Fusion el color del fondo de modelado es la primera preferencia que toca un
profesional y la que sobrevive a todo. Aquí no sobrevive a un F5.

### D-6 · Las notificaciones son de otro sistema de diseño, y no las oye un lector de pantalla

`apps/web/src/contexts/ToastContext.tsx:112-124`

```tsx
className="pointer-events-none flex items-start gap-3 rounded-2xl px-4 py-3
           bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl
           border border-black/5 dark:border-white/10
           shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25)]"
…
<p className="text-sm font-semibold leading-tight text-black dark:text-white">
<p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
```

y `ToastContext.tsx:129-133`:

```tsx
if (kind === 'error') return <AlertCircle className="… text-rose-500 …" />;
if (kind === 'info')  return <Info        className="… text-blue-500 …" />;
return                       <CheckCircle2 className="… text-emerald-500 …" />;
```

Es el canal por el que el producto dice «Guardado», «Error de guardado · cambios
pendientes» y «Conflicto de versión». Y no toca **un solo token**: cuarto radio
(`rounded-2xl`), sombra arbitraria escrita a mano, `text-sm` en vez de `type-small`,
grises de Tailwind en vez de `text-muted-foreground`, y los tres colores semánticos
inventados (`rose-500`, `blue-500`, `emerald-500`) teniendo `--danger`, `--primary` y
`--success` medidos a dos decimales dos ficheros más allá. El propio comentario declara
la deriva: «Notificaciones **estilo Apple**» — no estilo Valle.

Y el defecto duro: **el contenedor no lleva `aria-live` y la tarjeta de error no lleva
`role="alert"`**. Verificado por grep sobre el fichero: cero coincidencias de
`aria-live`, `role="status"` o `role="alert"`. Un usuario con lector de pantalla nunca se
entera de que el guardado falló. La línea de comandos, dos directorios más allá, sí lo
hace bien (`role="log" aria-live="polite"`); la deriva es local, no cultural.

Lo que salva parcialmente el fichero: el razonamiento de `LIFETIME_MS` (error 12 s
frente a acuse 3,5 s) y la deduplicación por contenido son excelentes.

### D-7 · El velo violeta de HATCH es invisible en tema claro — **1,09:1**

`apps/web/src/components/cad/palettes/CadHatchPalette.tsx:77`

```tsx
${pickMode ? "bg-amber-300 text-gray-950" : "bg-violet-500/20 text-violet-100 hover:bg-violet-500/30"}
```

`text-violet-100` (#ede9fe) sobre `bg-violet-500/20` compuesto sobre una tarjeta blanca da
**1,09:1**. Es el botón principal de la paleta de sombreados. En oscuro da 11,22:1 — el
espejo exacto del D-1: escrito mirando un solo tema.

### D-8 · El estado activo del panel de propiedades es cian y falla AA en claro — **3,04:1**

`apps/web/src/components/cad/studio/field-controls.tsx:34`

```tsx
style={active ? { background: "#0e7490" } : undefined}
```

`#0e7490` es `cyan-700`. El botón conserva `text-foreground`, que en claro es la tinta
oscura del tema: **3,04:1**, por debajo del 4,5 que el gate de la casa exige a todo lo
demás. En oscuro da 4,93:1, justo por encima. Además vuelve a introducir el cian por la
puerta del hex, que la regla 3 no vigila.

Mismo patrón en `apps/web/src/components/cad/viewport/CadOverviewMinimap.tsx:192,201,208`:
`stroke="#38bdf8"` / `fill="#38bdf8"` — `sky-400`, la familia que la regla 3 prohíbe por
nombre, escrita en hex para el marcador de cámara del minimapa.

### D-9 · Deriva de paleta cruda: 452 clases de Tailwind fuera del sistema

Medido sobre `src/**/*.tsx`:

```
452  clases (text|bg|border|ring|accent|from|to|via)-(indigo|violet|amber|rose|emerald|slate|gray|…)-N
112  de ellas en components/cad/editor/Layout3DEditor.tsx
 35  bg-indigo-400   ·  26 bg-indigo-500  ·  15 bg-indigo-600  ·  17 border-indigo-400
 25  bg-amber-400    ·  11 accent-indigo-500
 74  text-(slate|gray|zinc|neutral|stone)-N
```

El detalle que duele: **índigo es el acento de la v1 que la campaña de firma retiró por
«institucional y anónimo»**, y sigue siendo el color del botón de acción de
`CadXrefPalette.tsx:188`, `CadMLeaderPalette.tsx:256`, `CadBlockPalette.tsx:257`,
`CadMTextEditor.tsx:351` y de la casilla de verificación de
`CadWorkspaceDock.tsx:194` (`accent-indigo-500`). El acento nuevo es violeta 251°; índigo
es 239°. Están lo bastante cerca para que nadie lo cace a ojo y lo bastante lejos para
que la pantalla no se lea como una sola pieza.

### D-10 · 17 `shadow-2xl` en el estudio: todo flota al máximo

`Card.tsx:15` documenta el problema resuelto («la app tenía 29 `shadow-2xl` contra 2
`shadow-sm`… cuando todo flota nada destaca»). En el árbol de hoy quedan **17**, todos en
`components/cad`: `CadHatchPalette`, `CadDraftSettingsDialog`, `CadDynamicInput`,
`CadSelectionPalette`, `CadMLeaderPalette`, `CadDimensionPalette`, `CadStyleManagerPalette`,
`CadMTextEditor`, `CadBlockPalette`, `CadDialogShell`, `CadIncidentReporter` y seis en
`Layout3DEditor`. Frente a 12 `shadow-floating`. La corrección se hizo en el marketing y
no en el producto: en el estudio, catorce paletas compiten todas al mismo peso visual.

### D-11 · 17 valores de `z-index`, 13 de ellos arbitrarios

```
z-10 z-20 z-30 z-40 z-50
z-[65] z-[70] z-[75] z-[80] z-[82] z-[85] z-[90] z-[92] z-[95] z-[100] z-[200] z-[300] z-[400]
```

Sin token, sin escala, sin gate. `z-[82]` y `z-[85]` son dos decisiones que nadie puede
reconstruir. Ésta es la fábrica de los defectos que los goldens 67 y 68 («nada tapa un
control», «nada tapa el lienzo») tienen que cazar por captura de pantalla — y un golden
que caza por pantalla es un gate que llega tarde y caro.

### D-12 · `src/lib/glass.ts`: código muerto que documenta una clase inexistente

```ts
/** El estilo vive en globals.css bajo `.glass` … Uso: className={`${glass} rounded-[24px] …`} */
export const glass = 'glass';
```

`.glass` **no existe** en `globals.css` (verificado sobre las 1.573 líneas). El token
`--glass-opacity: 0.34` (línea 145) tiene cero consumidores. El módulo tiene cero
importaciones. Y su docstring recomienda `rounded-[24px]`, un cuarto radio fuera de los
tres del sistema. Es basura, pero basura que *enseña* a salirse del sistema a quien la
lea.

### D-13 · Anglicismos en la columna española de la interfaz

`apps/web/src/components/cad/palettes/CadWorkspaceDock.tsx:98-115`

```
density:  "Densidad del toolbar"     ← «barra de herramientas»
crosshair:"Tamaño del crosshair"     ← «mira»
pickbox:  "Pick box"                 ← sin traducir
title:    "Workspace profesional"    ← «espacio de trabajo»
profiles: "Distribuciones de workspace"
```

El resto del producto tiene un castellano cuidado y de oficio («cota», «designar»,
«encuadrar», «trama»). Este panel mezcla los dos idiomas dentro de la misma frase. Y la
i18n del estudio es un `if (english) { … } else { … }` a mano: sólo **1 de 64** ficheros
de `components/cad` usa `next-intl`, y `viewport-hints.tsx:11-13` declara por escrito que
su texto se queda «deliberadamente en castellano y sin claves de traducción».

### D-14 · Cuatro estados vacíos escritos tres veces, con la primitiva a cero usos

- `CadLayerManagerPalette.tsx:436` — `rounded-control border-dashed … px-2 py-3`
- `CadStyleManagerPalette.tsx:257` — `rounded-card border-dashed … px-2 py-4`
- `CadLayerManagerPalette.tsx:535` — sin borde, `px-1`
- `CadNativeEntityList.tsx:50` — `if (entities.length === 0) return null;` (desaparece
  en silencio, que es el peor estado vacío: no informa y no ofrece salida)

Tres paddings, dos radios, un `null`. `EmptyState` existe, está bien diseñado
(`art` + `title` + `description` + `action`, con la doctrina «un estado vacío sin salida
es un callejón» escrita en su cabecera) y tiene **0 usos**.

### D-15 · La vista previa de impresión no usa los tokens de impresión que ya existen

`globals.css:749-754` define `--print-paper`, `--print-ink`, `--print-ink-muted`,
`--print-line` con la razón escrita («la lámina impresa es la misma bajo cualquier
preferencia de pantalla»). `CadLayoutManager.tsx:64,91,138-171` pinta la misma cosa con
`bg-slate-200`, `stroke="#111827"` y `fill="#0f172a"`. Dos verdades sobre el mismo color
de tinta.

---

## 6 · Los huecos, ordenados por lo que más duele

### H-1 · Nadie mide el contraste de lo que se pinta, sólo el de la paleta — **bloqueante**

**AutoCAD/estándar:** Fusion y Rhino tienen equipos de accesibilidad y auditorías por
pantalla; Figma publica su `color-contrast` en el linter del propio design system.
**Valle hoy:** `check-contrast.mjs` mide 38 pares `token × token` sólidos y pasa
(verificado). Los tres textos invisibles de D-1, D-2 y D-7 nacen todos de un par
`bg-X/alfa` + `text-crudo` que ese gate no puede ver por construcción.
**Duele cuando:** un dibujante activa MEDIR en el tema por defecto y el renglón que le
dice qué hacer no está.
**Cómo se construye (concreto):**
1. Un extractor `scripts/design/extract-pairs.mjs` que recorre `src/**/*.{ts,tsx}`, saca
   cada cadena de clases y extrae los pares `(bg-*|bg-*/N)` × `(text-*)` que conviven en
   la misma cadena, incluyendo las ternarias.
2. Resolver cada clase contra los tokens (`bg-warning/15` → `--warning` al 15 %) y contra
   una tabla estática de la paleta de Tailwind para los colores crudos.
3. Componer el alfa sobre los tres fondos posibles (`--background`, `--card`,
   `--popover`) y sobre el lienzo, y pasar el resultado por `contrastRatio` de
   `scripts/design/contrast.mjs`, que ya existe.
4. Trinquete con presupuesto JSON, como `foco-visible-budget.json`: se publica el número
   de hoy y **sólo baja**.
**Verificación:** el gate falla hoy con al menos 3 infractores; tras arreglar D-1, D-2 y
D-7 el presupuesto arranca en su valor real y el CI lo congela.
**Esfuerzo:** un día.
**Ficheros:** `scripts/design/extract-pairs.mjs` (nuevo),
`scripts/design/check-contrast.mjs`, `package.json` (`check:contrast`).

### H-2 · Los gates de diseño no ven los `.ts`, que es donde vive la punta del lápiz — **bloqueante**

**Valle hoy:** `design-system.spec.ts:25` — `globSync("src/**/*.tsx")`. Seis ficheros
`.ts` de producto llevan clases Tailwind, y tres de ellos son la insignia de OSNAP, la
entrada dinámica, el menú de palabras clave, los cursores de colaboradores y las
chinchetas de comentario. Ahí sobreviven 8 clases cian, 8 `text-[Npx]` (dos de ellas por
debajo del piso de 11 px) y dos `bg-[#0b1020]`.
**Duele cuando:** el producto entero se ve violeta salvo lo que el usuario mira más, que
se ve cian. Es literalmente el defecto que la campaña de firma dijo haber cerrado.
**Cómo se construye:** cambiar el glob a `src/**/*.{ts,tsx}` en `design-system.spec.ts`,
correr, y arreglar los ~20 infractores que salgan: `bg-cyan-500/90` → `bg-primary`,
`text-cyan-100/200` → `text-primary-ink`, `text-[10px]`/`[11px]`/`[12px]` →
`type-micro`/`type-caption`, `bg-[#0b1020]/97` → `bg-popover/95`.
**Verificación:** el gate en verde con el glob ampliado; un golden nuevo que active MEDIR
y afirme que la insignia de OSNAP tiene `background-color` derivado de `--primary`.
**Esfuerzo:** horas para el glob, un día para los arreglos.
**Ficheros:** `src/components/ui/design-system.spec.ts`,
`src/components/cad/viewport/live-cursor.ts`, `grip-menu-host.ts`, `collab-overlay.ts`.

### H-3 · El lienzo no es de la casa y no obedece al tema — **alta**

**AutoCAD:** OPTIONS → Pantalla → Colores permite fijar el fondo del espacio modelo, del
espacio papel y de la ventana de comandos, y esa preferencia sobrevive a todo.
Fusion 360 y Rhino igual, con presets de gradiente.
**Valle hoy:** `editor-presentation.ts:21-53`, cuatro presets en hex sin relación con
ningún token, ninguno del sustrato de la marca; no se persiste (D-5); el conmutador de la
app lo pisa (D-5); y el color está duplicado tres veces
(`Layout3DEditor.tsx:2324`, `:5977`, `:15830`).
**Duele cuando:** el profesional entra, elige «Estudio» porque trabaja con luz de
ventana, recarga, y vuelve al azul marino. Y cuando la mitad izquierda de la pantalla es
grafito cálido y la derecha azul: el ojo lee dos programas.
**Cómo se construye:**
1. Añadir `--canvas-bg`, `--canvas-ground`, `--canvas-grid-major`, `--canvas-grid-minor`,
   `--canvas-fog` a `globals.css`, con su valor en `:root` y en `.dark`, derivados del
   grafito cálido de la marca.
2. En `editor-presentation.ts`, sustituir los cuatro literales por lectura de esas
   variables (`getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg')`
   → `new THREE.Color()`), dejando `night` y `studio` como **desviaciones declaradas**
   del token, no como paletas paralelas.
3. Añadir `canvasTheme: Theme3D` a `CadWorkspacePreferences`
   (`src/lib/cad/cad-workspace.ts:38`) con su `normalize` y su default; borrar el
   `useEffect` de `Layout3DEditor.tsx:2058-2061` y sustituirlo por «si el usuario nunca
   eligió, sigue al tema de la app; si eligió, manda su elección».
**Verificación:** `cad-workspace.spec.ts` cubre la nueva clave; un golden abre el
estudio, elige «Estudio», recarga y afirma que el canvas conserva su color; el gate de
contraste añade los pares `--foreground` sobre `--canvas-bg`.
**Esfuerzo:** varios días (hay que tocar el monolito con cuidado).
**Ficheros:** `src/app/globals.css`,
`src/components/cad/studio/editor-presentation.ts`, `src/lib/cad/cad-workspace.ts`,
`src/components/cad/editor/Layout3DEditor.tsx`.

### H-4 · Las primitivas no llegan al estudio: 280 botones a mano contra 6 — **alta**

**Linear/Figma:** un botón, un campo, un menú. La consistencia no se pide, se hereda.
**Valle hoy:** 10 de 64 ficheros de `components/cad` importan `@/components/ui`.
`EmptyState`, `Card` y `Switch` tienen 0 usos; `Modal`, `Tabs`, `Checkbox` y
`ProgressBar` tienen 1.
**Duele cuando:** el usuario abre tres paletas y ve tres ideas del mismo botón: la de
`CadHatchPalette:44` (borde + velo del acento), la de `CadDynamicInput:110` (relleno
ámbar) y la de `CadXrefPalette:188` (relleno índigo). No es feo; es **incoherente**, que
en una herramienta profesional se traduce en «esto no está terminado».
**Cómo se construye:** una variante `size="xs"` y `density="compact"` en `Button.tsx` y
en `Input.tsx`/`Select.tsx` con la altura que hoy usan las paletas (`py-0.5`/`py-1`,
`type-micro`), y después migrar paleta a paleta —hay 14— aprovechando que cada extracción
del monolito ya está planificada en `DEUDA-MONOLITO.md`. Cada migración paga además una
línea del trinquete de `foco-visible-budget.json` (27 → 0).
**Verificación:** endurecer la regla 6 de `design-system.spec.ts` de «la primitiva está
exportada» a «la primitiva tiene ≥ N usos», con N como trinquete que sólo sube; y un
presupuesto `<button>`-a-mano que sólo baja desde 280.
**Esfuerzo:** semanas, pero a plazos y ya presupuestadas por otra vía.
**Ficheros:** `src/components/ui/Button.tsx`, `Input.tsx`, `styles.ts`,
`src/components/cad/palettes/*.tsx`, `src/components/ui/design-system.spec.ts`.

### H-5 · Las notificaciones no se anuncian y no son del sistema — **alta**

**Estándar:** cualquier `toast` moderno es `role="status" aria-live="polite"` y los
errores `role="alert" aria-live="assertive"`.
**Valle hoy:** `ToastContext.tsx` — cero atributos ARIA (verificado por grep) y cero
tokens (D-6). Y es el canal por el que se anuncia que el guardado falló.
**Duele cuando:** un usuario con lector de pantalla pierde trabajo sin enterarse. Y
cuando cualquiera compara la tarjeta de aviso con la de `Feedback.tsx`, que sí es del
sistema, y ve dos productos.
**Cómo se construye:** `role="region" aria-live="polite" aria-atomic="false"` en el
contenedor de `ToastContext.tsx:92`, `role="alert"` en las tarjetas de `kind === 'error'`;
y sustituir el bloque de clases por `Surface`+`Badge` del sistema: `rounded-card`,
`shadow-floating`, `bg-popover/95`, `type-small`, `text-muted-foreground`, y
`text-danger-ink` / `text-primary-ink` / `text-success-ink` para los tres iconos.
**Verificación:** `axe-superficies.spec.ts` provoca un toast de error y comprueba el
anuncio; el gate del H-1 cubre los tres pares nuevos.
**Esfuerzo:** horas.
**Ficheros:** `src/contexts/ToastContext.tsx`, `e2e/a11y/axe-superficies.spec.ts`.

### H-6 · axe sólo audita el editor cerrado — **alta**

**Valle hoy:** `e2e/a11y/axe-estudio.spec.ts` audita el editor recién abierto y el
overlay de atajos, en los dos temas, con cero excepciones. Es un buen gate y lo dice bien
en su cabecera. Pero las 14 paletas, los 8 cuadros, la insignia de OSNAP y el aviso vivo
exigen un clic o una herramienta activa, y ninguno se audita nunca. D-1, D-7 y D-8 viven
justo ahí.
**Duele cuando:** el gate está en verde y el producto tiene texto a 1,17:1.
**Cómo se construye:** una tabla de superficies `[testid del disparador, testid del panel]`
—las 14 paletas ya tienen `data-testid="cad-…"`— y un bucle que abra cada una y llame a
`auditar()`. Y añadir un caso que active MEDIR y MURO para que el `cad-live-prompt`
exista durante la auditoría. Nota: axe da `incomplete`, no `violation`, cuando el fondo
es un `<canvas>`; por eso el gate del H-1 (estático, sobre el código) es el que de verdad
cierra el hueco, y éste lo complementa.
**Verificación:** el propio spec, con la lista de superficies como dato y una aserción de
que la lista cubre todos los `data-testid` de paleta que existen en el árbol.
**Esfuerzo:** un día.
**Ficheros:** `apps/web/e2e/a11y/axe-estudio.spec.ts`.

### H-7 · La densidad se elige para una barra de cinco — **media**

**AutoCAD:** la cinta tiene botones grandes/pequeños, paneles plegables y se puede
minimizar a pestañas; el usuario recupera altura de lienzo a voluntad.
Fusion 360 tiene tres densidades de toda la interfaz.
**Valle hoy:** `toolbarDensity` existe, se persiste bien
(`cad-workspace.ts:45`) y se aplica **en un solo sitio**:
`Layout3DEditor.tsx:14680` (`h-12` vs `h-14`). La cinta, las 14 paletas y la barra de
estado ignoran la preferencia. Los comentarios del código enseñan el coste: la cinta
medía 116 px y hubo que bajarla a mano con `py-0.5`, la paleta de herramientas pasa a dos
columnas por `@media (max-height: 820px)`, la barra de estado tiene su propia regla…
Cada apretón es un parche puntual en vez de una escala.
**Duele cuando:** un dibujante en un portátil de 1366×768 quiere el lienzo que AutoCAD le
da con un clic en «minimizar cinta», y aquí no hay palanca.
**Cómo se construye:** convertir la densidad en un atributo de datos en la raíz
(`<div class="cad-shell" data-density="compact">`) y definir en `globals.css` un bloque
`[data-density="compact"]` con tres variables —`--cad-row`, `--cad-pad`, `--cad-gap`— que
consuman la cinta, las paletas y la barra de estado. Añadir un tercer escalón
`ultra` (cinta a sólo iconos, sin rótulo) que es el equivalente del `RIBBONSTATE` de
AutoCAD.
**Verificación:** golden que mide la altura del lienzo en los tres escalones a 720 px y
afirma que crece monótonamente; el golden 19 ya fija el suelo de 520 px.
**Esfuerzo:** varios días.
**Ficheros:** `src/app/globals.css`, `src/lib/cad/cad-workspace.ts`,
`src/components/cad/ribbon/*.tsx`, `src/components/cad/palettes/*.tsx`.

### H-8 · No hay escala de elevación ni de apilamiento en el producto — **media**

**Valle hoy:** 17 `shadow-2xl` (D-10) y 17 valores de `z-index`, 13 arbitrarios (D-11).
**Duele cuando:** una paleta nueva aterriza encima de la anterior sin que nadie sepa por
qué, y el golden 68 lo caza por captura de pantalla tres semanas después.
**Cómo se construye:** cinco tokens `--z-canvas: 10`, `--z-overlay: 20`, `--z-palette: 30`,
`--z-dialog: 40`, `--z-toast: 50` en `@theme` (Tailwind los emite como `z-canvas`, …), y
una regla en `design-system.spec.ts` que prohíba `z-[N]` y `shadow-2xl|xl|lg|sm` fuera de
las tres elevaciones con nombre, con trinquete desde 17.
**Verificación:** el gate; y los goldens 67/68 pasan a ser confirmación, no detección.
**Esfuerzo:** un día.
**Ficheros:** `src/app/globals.css`, `src/components/ui/design-system.spec.ts`, las 14
paletas.

### H-9 · Índigo, el acento retirado, sigue siendo el color de acción del estudio — **media**

**Valle hoy:** 158 clases `indigo-*` (de ellas 11 `accent-indigo-500`) (D-9). La regla 3 del gate
prohíbe `cyan|sky|teal` pero no `indigo`, que es precisamente el acento **de la versión
anterior** que la campaña de firma retiró por anónimo.
**Duele cuando:** el botón «Adjuntar» de Xref es índigo, el de «Crear cota» esmeralda y
el de «Modo punto» ámbar. El usuario no puede aprender qué color significa «acción
principal» porque no significa nada.
**Cómo se construye:** ampliar la lista prohibida de la regla 3 a **toda** familia
cromática de Tailwind (`indigo|violet|purple|emerald|green|amber|orange|rose|red|blue|slate|gray|zinc|neutral|stone`)
con un trinquete desde 452, y migrar por lotes:
relleno de acción → `bg-brand-strong text-primary-foreground`; estado activo →
`bg-primary/15 text-primary-ink border-primary/30`; confirmación → `text-success-ink`;
aviso → `text-warning-ink`.
**Verificación:** el trinquete; y un `check:brand` que afirme que ningún color de acción
del estudio queda fuera de la familia 251°.
**Esfuerzo:** varios días.
**Ficheros:** `src/components/ui/design-system.spec.ts` y las 14 paletas + los 8 cuadros.

### H-10 · Los estados vacíos son cuatro invenciones y una desaparición — **media**

**Linear:** cada lista vacía enseña qué es esa lista y ofrece la acción que la llena.
**Valle hoy:** D-14. `EmptyState` existe y tiene 0 usos.
**Duele cuando:** alguien abre XREF por primera vez y no ve nada; ni qué es una
referencia externa, ni cómo se adjunta. `CadNativeEntityList.tsx:50` devuelve `null`: en
un documento en blanco, el panel de entidades simplemente no está.
**Cómo se construye:** una variante `EmptyState size="xs"` con el padding de paleta
(`gap-2 p-4`, `type-micro`), y sustituir los cuatro sitios. Cada uno con su `action`: en
XREF, «Adjuntar un DXF»; en estilos, «Crear estilo»; en capas filtradas, «Quitar el
filtro».
**Verificación:** un spec que afirme que `EmptyState` tiene ≥ 6 usos y que
`CadNativeEntityList` no devuelve `null` con lista vacía.
**Esfuerzo:** un día.
**Ficheros:** `src/components/ui/EmptyState.tsx`, `CadLayerManagerPalette.tsx`,
`CadStyleManagerPalette.tsx`, `CadXrefPalette.tsx`, `CadNativeEntityList.tsx`.

### H-11 · El movimiento del sistema no se usa donde se trabaja — **media**

**Valle hoy:** `motion-instant` 0 usos, `motion-confirm` 0 usos, `motion-fast` 8,
`motion-base` 2, `motion-slow` 1. En `components/cad`: **una** clase `motion-*` y siete
`duration-150|200` a mano. `construction-line` y `construction-line-vertical`, escritas
y documentadas, tienen 0 usos.
**Duele cuando:** el estudio se siente estático mientras el marketing se siente vivo, y
la firma de la casa —el trazo que se dibuja solo (`.stroke-draw`, 23 usos)— no aparece ni
una vez dentro del producto. Es la pieza de identidad más fuerte que tiene el repositorio
y sólo la ve quien no ha comprado todavía.
**Cómo se construye:** (a) `motion-confirm` en el pulso del guardado
(`CadSaveStatus.tsx`) y en el check de una cota creada; (b) `.stroke-draw` en la
previsualización de comando (cuando LINE muestra el segmento fantasma, que se trace en
vez de aparecer); (c) `construction-line` para el rastreo polar y los ejes auxiliares,
que es exactamente para lo que se escribió; (d) sustituir los siete `duration-N` por su
clase.
**Verificación:** regla en `design-system.spec.ts` que prohíba `duration-[0-9]+` fuera de
`globals.css`; un spec que afirme ≥ 1 uso de cada clase de movimiento.
**Esfuerzo:** varios días (el (b) toca el motor de previsualización).
**Ficheros:** `src/components/cad/studio/CadSaveStatus.tsx`,
`src/components/cad/viewport/live-cursor.ts`, `src/lib/cad/engine/`, `globals.css`.

### H-12 · La interfaz del estudio no está internacionalizada — **media**

**AutoCAD:** 14 idiomas, con la terminología de dibujo de cada uno certificada.
**Valle hoy:** 1 de 64 ficheros de `components/cad` usa `next-intl`; el resto son
literales o el `if (english)` a mano de `CadWorkspaceDock.tsx:58-115`, con anglicismos
dentro de la columna española (D-13). `viewport-hints.tsx:11` lo declara como decisión
consciente y aplazada.
**Duele cuando:** el mercado mexicano —«la fuerza de apertura del producto, no su
techo», dice AGENTS.md— crece hacia EE. UU. y el estudio no se puede vender en inglés.
**Cómo se construye:** el `next-intl` ya está montado (`messages/es`, `messages/en`,
`I18nProvider`). Un namespace `cad.studio` y migración por paleta, arrastrando el
`if (english)` a claves. Empezar por `CadWorkspaceDock` (que ya tiene las dos columnas
escritas: es copiar y pegar) y `viewport-hints`.
**Verificación:** `check:json-keys` ya compara claves entre idiomas; añadir un gate que
cuente literales largos con acento fuera de `messages/` en `components/cad` y sólo baje.
**Esfuerzo:** semanas.
**Ficheros:** `messages/es`, `messages/en`, los 14 ficheros de paleta.

### H-13 · La vista previa de impresión ignora los tokens de impresión — **baja**

D-15. `--print-paper` / `--print-ink` / `--print-line` existen y están razonados; el
previsualizador pinta `bg-slate-200` y `#111827`. Cambiar las cinco referencias de
`CadLayoutManager.tsx:64,91,138-171` a `var(--print-*)`. Horas.
**Verificación:** regla del gate que prohíba hex en `components/cad/palettes`.

### H-14 · `src/lib/glass.ts` es código muerto que enseña a salirse del sistema — **baja**

D-12. Borrar el módulo y el token `--glass-opacity`, o implementar `.glass` de verdad. Lo
segundo sólo si alguien la va a usar; hoy nadie la usa. Horas.

---

## 7 · La apuesta ganadora

> **El plano vivo, compartido por un enlace, con la firma visual de la casa encima.**

No es una idea nueva del producto: **ya está construida y funciona**. Lo que falta es
verla. El material existe y lo he leído:

- `src/lib/cad/collab/presence.ts:82-100` — ocho colores de compañero repartidos por
  FNV-1a sobre el `peerId`: mismo id ⇒ mismo color en todas las pestañas, con la razón
  escrita de por qué no se genera al azar.
- `src/components/cad/viewport/collab-overlay.ts` — cursores y chinchetas de comentario
  ancladas a **coordenadas del dibujo**, repintadas en un solo `requestAnimationFrame`,
  reutilizando nodos por id, con el `pointermove` pasivo. Panear 20.000 entidades cabe en
  8,1 ms de p95 y hay un trinquete que lo defiende.
- `src/components/cad/collab/ReviewLinkClient.tsx` y `ReviewPlanView.tsx` — un enlace
  público de revisión: el cliente del dibujante abre una URL y comenta **sobre el plano**,
  sin instalar nada, sin licencia, sin cuenta.

Eso AutoCAD **no lo puede hacer**. No es que no lo haya hecho: no puede. Es una
aplicación de escritorio con un formato de fichero binario y un modelo de licencia por
puesto. Autodesk vende «Shared Views», que es un PDF glorificado en un visor: no hay
cursores, no hay presencia, no hay anclaje a coordenadas del modelo, y desde luego no hay
alguien dibujando mientras tú miras.

**Por qué es la apuesta de *diseño* y no de ingeniería:** la ingeniería ya está. Lo que
decide si esto vende es cómo se ve. Hoy se ve así:

- la etiqueta con el nombre del compañero mide **10 px** — por debajo del piso que el
  propio repositorio declara ilegible (`collab-overlay.ts:96`);
- el ordinal de la chincheta resuelta está a **1,62:1** en el tema por defecto (D-2);
- el anillo de la chincheta activa es **cian** (`collab-overlay.ts:249`);
- el enlace público que ve el cliente tiene el fondo clavado en `bg-[#070b16]`
  (`ReviewLinkClient.tsx:222,288`), un azul marino que ignora el tema y no es el de la
  marca;
- los cursores no tienen movimiento: se escriben con `translate3d` sin transición, así
  que saltan en vez de deslizarse. Figma resolvió eso en 2017 con una interpolación de
  ~80 ms, y es literalmente la diferencia entre «hay alguien ahí» y «hay un glitch».

**Qué construir, en orden:**

1. **Arreglar los cuatro defectos de arriba** (H-1, H-2, D-2). Un día. Sin esto, todo lo
   demás se ve encima de texto invisible.
2. **Interpolar el cursor** con `--duration-instant` (90 ms, ya existe, 0 usos) sobre
   `transform`. Media hora de trabajo y es el 80 % de la sensación.
3. **Rehacer la paleta de presencia sobre la marca**: ocho tonos derivados del violeta
   251° por rotación de tono controlada, medidos contra el nuevo `--canvas-bg` (H-3) con
   el metro que ya existe, con el mismo reparto estable por FNV-1a. Hoy incluye cian
   (`#22d3ee`) y lima (`#a3e635`), que en el preset claro del lienzo se pierden.
4. **Dar al enlace de revisión la portada del producto**: `ReviewPlanView` sobre el
   sustrato de la marca, con la retícula `blueprint-grid` que ya existe, el trazo
   `.stroke-draw` al cargar el plano, y la lista de comentarios en `Surface`. Es la única
   pantalla de Valle que verá un cliente que no es usuario, y hoy es la peor del
   producto.

Un dibujante compra AutoCAD porque su cliente le pide un DWG. Compraría Valle porque
puede mandarle a ese cliente un enlace, ver dónde está mirando, y responderle sobre el
plano sin exportar nada. Ésa es la frase de venta, y hoy está a cuatro arreglos de
distancia de ser cierta también en la pantalla.

---

## 8 · Resumen para el comité

| | |
| --- | --- |
| **Criterio de diseño** | Excelente. Escrito, razonado y medido. Por encima de la media de la industria. |
| **Ejecución en marketing y cuenta** | Muy buena. Compite con Linear. |
| **Ejecución en el producto** | Deficiente y en deriva. Cuatro textos invisibles, dos identidades cromáticas, 452 clases fuera del sistema. |
| **Gates** | Bien construidos, mal delimitados. Los cuatro pasan con el producto roto. |
| **Riesgo** | Bajo. Nada de esto es arquitectura; es alcance de gate y trabajo mecánico. |
| **Coste de cerrar los bloqueantes (H-1, H-2, D-1, D-2, D-7)** | 2 días. |
| **Coste de cerrar todo lo alto (H-3 a H-6)** | ~2 semanas. |
| **Nota** | **6,5 / 10** contra AutoCAD completo. Con H-1 a H-6 cerrados: 8,5. |

Lo que compraría de este repositorio no es la pantalla de hoy: es que la pantalla de hoy
está a dos días de ser correcta, y que quien escribió `globals.css` sabe exactamente por
qué.
