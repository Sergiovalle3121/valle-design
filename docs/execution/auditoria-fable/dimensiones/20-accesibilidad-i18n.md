# Auditoría · Dimensión 20 · Accesibilidad, teclado e idiomas

**Fecha:** 2026-09-05 · **Alcance:** `apps/web/src/i18n/`, `apps/web/messages/`,
`apps/web/src/components/cad/**`, `apps/web/src/lib/cad/engine/**`,
`apps/web/e2e/a11y/`, `scripts/design/check-contrast.mjs`, `apps/web/src/app/globals.css`.
**Método:** lectura del árbol real + ejecución de los instrumentos que el propio repo
publica (`catalog-contract.spec.ts`, `foco-visible.spec.ts`, `check-contrast.mjs`,
`ribbon.ts`). Ningún número de este informe está estimado: todos salen de una corrida
o de un `grep` reproducible que se cita al lado.

---

## 0 · Veredicto

> El teclado del dibujante está construido y probado —se dibuja una polilínea cerrada
> sin tocar el ratón, y hay un golden que lo demuestra—; lo que no está construido es
> el producto en un segundo idioma: **0,4 % del texto sale de catálogos**, el idioma
> por defecto es el inglés y la interfaz está escrita en español a mano.

**Nota: 5 / 10** contra AutoCAD completo en esta dimensión.

La nota sube por tres cosas reales que AutoCAD no tiene o hace peor (línea de comandos
anunciada a lector de pantalla, gate de contraste medido en dos temas, gestos táctiles
probados) y baja por una que AutoCAD sí tiene desde hace treinta años: **estar
completamente traducido a catorce idiomas, con vocabulario de comandos localizado**.

### La rúbrica no mide esta dimensión

Primer hallazgo, y no es menor para quien invierte: `docs/competitive/rubric.json`
tiene **36 categorías y 271 puntos, y ninguna fila mide accesibilidad ni idiomas**.
Lo comprobé recorriendo el JSON entero:

```
$ node -e "const r=require('./docs/competitive/rubric.json');
  console.log(r.categories.filter(c=>/accesib|a11y|idioma|i18n|ingl|aria|contraste|rtl/i
    .test(JSON.stringify(c))).map(c=>c.id))"
[]                     # ninguna categoría; sólo aparecen coincidencias léxicas
                       # sueltas (DIMLINEAR, COLINEAL) en otras filas
```

Lo más cercano es `recognition.keys-to-command-line` (2 pt) y `draw-2d.toggles` (1 pt),
que miden **memoria muscular de AutoCAD**, no accesibilidad. Consecuencia práctica: el
244/271 se puede mantener intacto mientras el producto sea inutilizable para alguien
con lector de pantalla o para alguien que no hable español. Esa es exactamente la clase
de agujero que una rúbrica bien hecha debería impedir, y aquí no lo impide.

Tampoco lo cubre el backlog de auditoría: `apps/web/e2e/auditoria/manifiesto.json`
declara 28 defectos pendientes y **ninguno es de accesibilidad ni de idioma**.

---

## 1 · Lo que ya existe y está bien

Este repositorio es enorme y lo caro es declarar que falta algo construido. Esto está
construido, lo miré, y varias piezas son mejores que su equivalente en AutoCAD.

### 1.1 · Se dibuja sin ratón, y hay prueba

`apps/web/e2e/golden/44-cad-command-line.spec.ts` — **cero llamadas a `.click()` o
`page.mouse`** (verificado: `grep -c "mouse\.\|\.click(\|hover(" → 0`). El recorrido es:

```
type(page, 'L')          → prompt visible
type(page, '0,0')
type(page, '@2000,0')    → aparece [desHacer]
type(page, '@0,1500')    → aparece [Cerrar]
type(page, 'C')          → prompt oculto, documento con 3 entidades nativas
Control+z / Control+Shift+z / Space (repetir)
```

Esto es la esencia del CAD por teclado y está probado a nivel de documento, no de
pixel. Es el activo más fuerte de la dimensión.

### 1.2 · Los conmutadores F* de AutoCAD, completos

`apps/web/src/lib/cad/keyboard-shortcuts.ts:177-216` — F3 (osnap), **F7 (grilla),
F9 (forzado), F12 (entrada dinámica)**, F8 (orto), F10 (polar), F11 (rastreo).
El campo `gap` de `draw-2d` en la rúbrica dice que F7/F9/F12 «no están en
keyboard-shortcuts.ts», fechado el 2026-08-20: **ese gap está caduco**, las tres teclas
existen hoy con su comentario explicando que se añadieron. Es un ejemplo de por qué hay
que mirar el árbol y no la rúbrica.

### 1.3 · Precedencia de teclado modelada como función pura

`apps/web/src/lib/cad/editor-keyboard.ts` — el intérprete del teclado del estudio está
separado del ejecutor y es testeable en Node sin DOM. Distingue
`editable` / `control` / `other` como destino (`editorKeyEventLike`, línea 48), respeta
`isComposing` (IME, línea 36) y documenta que toda acción devuelta exige
`preventDefault()`. Esto es ingeniería de teclado seria; muchas apps web no llegan aquí.

### 1.4 · La línea de comandos SÍ está anunciada

`apps/web/src/components/cad/command-line/CadCommandLine.tsx:155-168`:

```tsx
data-testid="cad-command-line-log"
role="log"
aria-live="polite"
aria-label="Diálogo de la línea de comandos"
```

y el prompt entra ahí de verdad —`command-engine-host.ts:714`
`this.log(effect.prompt.message, "prompt")`—, así que un lector de pantalla oye
«Precise el primer punto» al arrancar LINE. **AutoCAD de escritorio no ofrece esto con
esta limpieza.** Es la pieza sobre la que se construye la apuesta ganadora (§5).
La caja lleva `aria-label="Línea de comandos CAD"` (línea 209).

### 1.5 · Gate de contraste real, medido, en dos temas

`scripts/design/check-contrast.mjs` — corrido ahora mismo:

```
Gate de contraste OK: 76 pares medidos en 2 temas (38 por tema).
El par más ajustado es «la tarjeta despegada de la página» en claro: 1,09:1
sobre un mínimo de 1,05:1.
```

Umbrales 4,5:1 texto / 3:1 gráfico, **sin la excepción de texto grande** y **sin lista
de excepciones**. Compone alfa sobre el fondo (`composite`) porque axe encontró tres
violaciones que la medición opaca no veía. Está bien hecho.

### 1.6 · axe-core sobre 15 rutas × 2 temas, y el estudio incluido

- `apps/web/e2e/a11y/axe-superficies.spec.ts` — 13 rutas públicas + `/dashboard` +
  `/cuenta`, en claro y oscuro, `wcag2a/wcag2aa/wcag21a/wcag21aa`, cero violaciones
  serias o críticas, **sin lista de excepciones** (línea 30-35). Y comprueba que la
  página es la que se pidió y no la frontera de error antes de auditar (línea 57-70) —
  una trampa que ya les mordió una vez.
- `apps/web/e2e/a11y/axe-estudio.spec.ts` — el editor real en `/demo`, más el overlay
  de atajos, con **verificación de trampa de foco de 12 tabulaciones** (línea 68-81).
- `apps/web/e2e/a11y/teclado-embudo.spec.ts` — recorrido con teclado del embudo:
  escribir sin perder el foco, Escape que devuelve el foco a su botón, trampa de Tab
  de 20 pulsaciones y **25 tabulaciones comprobando que cada control tiene anillo**
  (línea 96-125).

Lighthouse exige `categories:accessibility ≥ 0.95` en `/`, `/register` y `/precios`
(`scripts/perf/lighthouserc.json:27`), y **bloquea**.

### 1.7 · `prefers-reduced-motion` resuelto en un solo sitio

`apps/web/src/app/globals.css:591-593, 703, 1265` — una regla global neutraliza toda
animación CSS, y los componentes que animan con JS lo consultan
(`CountUp.tsx:25`). El comentario de la línea 617 dice la parte difícil bien:
«respetar `prefers-reduced-motion` no es apagar el motor».

### 1.8 · Objetivo táctil de 44 px, con instrumento

`apps/web/src/components/ui/styles.ts:43` (`touchTarget = "min-h-11"`),
`globals.css:1470-1503` (44 px **sólo con puntero grueso**, que es lo correcto: no
inflar el chrome denso del estudio en un ratón), `scripts/cad/touch-probe-instruments.mts:290`
y `scripts/cad/touch-support-evidence.mjs:228` publican los objetivos por debajo de 44 px.
`e2e/public/mobile-accessibility.spec.ts:78` lo afirma en el embudo.
`e2e/golden/56-cad-tableta-en-obra.spec.ts` conduce el recorrido entero con contactos
y **declara su límite** («Chromium con táctil emulado NO es un iPad»).

### 1.9 · Unidades imperiales de verdad, en los dos sentidos

`apps/web/src/lib/cad/units-imperial.ts` — `1'-6 1/2"`, `12'`, `6"`, `6 1/2`, `1'6`,
comillas curvas y dobles primas, todas leídas; `CAD_INCH_MM = 25.4` y
`CAD_FOOT_MM = 304.8` escritos por separado a propósito (el producto en coma flotante
da 304.79999999999995). `$INSUNITS` mapeado en los dos sentidos. `units-imperial.spec.ts`
son 805 comprobaciones. `UNITS`/`UN`/`DDUNITS` está en el registro
(`command-manifest.ts:278`). **Esto no falta, y sería el error caro decir que falta.**

### 1.10 · Módulo de región: el eje «región» separado del eje «idioma»

`apps/web/src/lib/cad/region/` (520 líneas, 8 archivos) — `RegionProfile` con
`numberLocale`, `dateLocale`, `measurementSystem`, `paperSeries`, `defaultPaper` y
`dimensionStandardFamily`. Tres perfiles (MX/ES/US), resolución pura desde cookie +
`Accept-Language` con precedencia escrita y probada (`region.spec.ts`, 142 líneas),
y **19 consumidores reales** fuera del módulo. La decisión de que «región» e «idioma»
son ejes distintos es correcta y poco común. El problema no es el módulo: es que la
superficie más caliente del producto lo esquiva (§3.6).

---

## 2 · La cifra que manda: 0,4 %

Corrí el instrumento del propio repo, sin tocarlo:

```
$ cd apps/web && npx tsx src/i18n/catalog-contract.spec.ts
catalog-contract: 8 bloques verdes.
  CATÁLOGOS (gate): 3 namespaces × 2 idiomas = 33 claves por idioma, sin un solo
  defecto [appUpdate, language, offline].
  CIFRA 1 · cobertura por claves: 33/8481 = 0.4 % (TECHO: el detector cuenta frases,
  no palabras sueltas).
  CIFRA 2 · superficie pendiente: 8448 textos en español cableados fuera de claves,
  en 625/1085 archivos de apps/web/src.
  por área — lib-cad 5721 (382/670 arch.) · components-cad 674 (84/152 arch.)
             · app-docs 253 (10/11 arch.) · marketing 585 (38/49 arch.)
             · resto 1215 (111/203 arch.)
```

Tres namespaces traducidos: `language` (el propio conmutador), `offline` (la pantalla
sin conexión) y `appUpdate` (el aviso del service worker). **Ninguna superficie de
dibujo.** `apps/web/messages/index.ts` lo dice sin adornos: «Los textos del editor CAD
siguen viviendo inline en los componentes […]; migrarlos es trabajo pendiente».

Y el idioma por defecto es **inglés**: `apps/web/src/i18n/config.ts:19`
`export const defaultLocale: Locale = "en";`

Así que la configuración de fábrica del producto es: `<html lang="en">`
(`apps/web/src/app/layout.tsx:128`) sobre 8.448 frases en español. Eso es
**WCAG 3.1.1 (Language of Page, nivel A) incumplido por construcción**, no por
descuido: un lector de pantalla pronuncia «Precise el punto siguiente» con fonemas
ingleses. No hay un solo `lang="es"` en ningún bloque de contenido del árbol
(`grep -rn 'lang="es"' apps/web/src → 0`).

Sólo un componente de los 152 de `components/cad/` habla dos idiomas, y lo hace con
un ternario en línea: `CadWorkspaceDock.tsx:46-92` (`const labels = english ? {...} : {...}`).
Es también el **único sitio del producto entero** donde está montado el conmutador
de idioma (§3.5).

---

## 3 · Los huecos, por lo que más duele

### H1 · Los atajos de palabra clave son españoles y CHOCAN con los de AutoCAD (bloqueante)

Éste es el peor, y es de los que no se ven hasta que destruyen trabajo.

`apps/web/src/lib/cad/engine/commands/draw-pline.ts:54-61`:

```ts
const CLOSE     = { keyword: "Cerrar",         shortcut: "C" };
const UNDO      = { keyword: "desHacer",       shortcut: "H" };
const ARC       = { keyword: "Arco",           shortcut: "A" };
const LINE      = { keyword: "Línea",          shortcut: "L" };
const WIDTH     = { keyword: "Ancho",          shortcut: "N" };
const HALFWIDTH = { keyword: "Media-anchura",  shortcut: "M" };
const LENGTH    = { keyword: "Longitud",       shortcut: "T" };
const ANGLE     = { keyword: "Ángulo",         shortcut: "G" };
```

PLINE en AutoCAD (inglés) ofrece `[Arc/Halfwidth/Length/Undo/Width]` → **A / H / L / U / W**.
Puestos uno junto al otro:

| Tecla | AutoCAD inglés | Valle Design | Consecuencia |
|---|---|---|---|
| `H` | **Halfwidth** (media anchura) | **desHacer** | **Borra el último vértice** en vez de cambiar el grosor |
| `L` | **Length** (longitud) | **Línea** | Cambia de modo arco a línea |
| `W` | Width | — | No hace nada |
| `U` | Undo | — | No hace nada |
| `T` | — | Longitud | Nadie lo teclea |

Un dibujante formado en AutoCAD en inglés que teclea `H` para poner media anchura
**pierde el vértice que acaba de colocar**, en silencio. No es incomodidad: es pérdida
de trabajo por una colisión de teclas.

Y hay 550 pares `keyword`/`shortcut` así, todos españoles
(`grep -rno 'keyword: "[^"]*"' apps/web/src/lib/cad/engine/commands/*.ts | wc -l → 550`),
más **592 mensajes de prompt** en español literal
(`grep -rn 'message: "' … → 592`).

Lo más grave es que **el contrato ya preveía la solución y nadie la usó**.
`apps/web/src/lib/cad/engine/command-types.ts:72-79`:

```ts
export interface CadKeyword {
  /** Palabra completa: `Close`. */
  keyword: string;
  /** Letras que la eligen: `C`. Se compara sin distinguir mayúsculas. */
  shortcut: string;
  /** Texto mostrado si difiere de `keyword` (localizable). */
  label?: string;
}
```

El diseño era: `keyword` canónico en inglés (estable para scripts), `label` localizado
para pantalla. Los 550 sitios hacen lo contrario, y `label` se usa **12 veces** de 550.

- **Qué hace AutoCAD:** localiza la palabra visible y conserva SIEMPRE la inglesa
  precedida de `_` (`_C`, `_U`), que es lo que hace portables los `.scr` y los `.lsp`
  entre idiomas.
- **Qué hace Valle hoy:** el resolvedor **ya sabe quitar el `_`**
  (`alias-table.ts:309` y `:315`), pero no hay ninguna palabra clave inglesa que
  resolver.
- **Por qué duele:** cualquier rutina LISP o `.scr` copiada de internet —el 100 % están
  en inglés— falla en el primer `U` o `W`; y quien viene de AutoCAD en inglés destruye
  geometría con `H`.
- **Coste:** varios días.
- **Cómo se construye:** ampliar `CadKeyword` a
  `{ keyword: string /* canónico inglés */, shortcut: string /* canónico */,
     label?: string, localShortcut?: string }`, poner el inglés en `keyword`/`shortcut`
  y el español en `label`/`localShortcut`. `matchCadKeyword`
  (`engine/prompt.ts:62-80`) ya tiene la precedencia correcta (exacto → atajo más largo
  → prefijo, empate = `null`); sólo hay que hacer que consulte **los dos juegos**, con
  el canónico ganando cuando el token venía precedido de `_` y el local ganando cuando
  no. Migración mecánica archivo por archivo, con un gate `check:keyword-parity` que
  falle si un `CadKeyword` no declara los dos.
- **Cómo se verifica:** una spec de tabla que, para las 30 órdenes con palabras clave,
  compruebe que la letra inglesa de AutoCAD resuelve a la MISMA acción que la española,
  y un golden que repita el recorrido de `44-cad-command-line.spec.ts` tecleando
  `L / 0,0 / @2000,0 / @0,1500 / _C` en vez de `C`.

### H2 · No existe vocabulario de comandos en español (alta)

`AGENTS.md` declara que «el vocabulario de comandos en español» es «la fuerza de
salida del producto». Lo medí:

```
$ node -e "…313 alias en command-manifest.ts…"
total aliases 313
aliases con pinta española: 19
  DDINSERT BLOQUEDINAMICO PARAMETROBLOQUE LISTABLOQUESDIN LISTAETIQUETAS
  LISTACONDUCTORES CAPABORRAR NUMTEXTO TEXTOAMTEXTO LISTAMATERIALES
  RECORTARPDF ESCALARPDF LISTARPDF LISTAEQUIPOS LINEAPROCESO LISTALINEAS
  LISTAMATERIAL CAPASMX DIBUJOSOL
```

19 de 313, y todos de verticales de nicho (PDF, planta, eléctrico). **Ninguno del
núcleo**: `LINEA`, `CIRCULO`, `ARCO`, `BORRA`, `DESPLAZA`, `COPIA`, `GIRA`, `ESCALA`,
`SIMETRIA`, `DESFASE`, `RECORTA`, `ALARGA`, `EMPALME`, `MATRIZ`, `SOMBREA`, `CAPA`,
`ACOTALINEAL`, `ZOOM`, `ENCUADRE` no resuelven nada.

La doctrina está escrita en `alias-table.ts:9-12`:

> «Los nombres canónicos y sus alias son **invariantes entre idiomas**, igual que en
> AutoCAD: lo que se traduce es el prompt, nunca el nombre. Sin esa separación, activar
> el español rompería toda macro y todo script escrito en inglés.»

**La premisa es falsa.** AutoCAD en español SÍ traduce los nombres de comando —`LINEA`,
`BORRA`, `DESPLAZA` son los nombres reales del producto en español— y resuelve el
problema de las macros exactamente con el `_` que este mismo archivo ya implementa
(línea 309). El dilema que el comentario plantea no existe: AutoCAD lo resolvió en los
noventa.

- **Por qué duele:** el arquitecto mexicano al que se le vende esto teclea `LINEA` en
  su primer minuto, no pasa nada, y concluye que el producto no habla su idioma —
  justo al revés de la promesa comercial.
- **Coste:** un día. Es una tabla.
- **Cómo se construye:** `apps/web/src/lib/cad/engine/alias-table-es.ts` con
  `CAD_COMMAND_ALIASES_ES: Record<string,string>` para las ~130 órdenes del núcleo.
  `resolveCadCommandAlias` consulta primero `CAD_COMMAND_ALIASES` (canónico), luego el
  español si `locale === "es"` y el token no venía con `_`. Cero cambios en el registro,
  cero cambios en los descriptores, ningún identificador persistido tocado.
- **Cómo se verifica:** spec de tabla que exija que los 129 alias de `acad.pgp` siguen
  resolviendo intactos (no-regresión) y que las ~130 palabras españolas resuelven al
  mismo canónico; golden que teclee `LINEA` y dibuje.

### H3 · 43 controles del estudio se enfocan sin verse (alta)

El repo ya cuenta 27 y los tiene bajo trinquete
(`apps/web/src/components/ui/foco-visible-budget.json`, `maximo: 27`, «sólo baja»).
Corrí el instrumento y localicé los 27:

```
9 src/components/cad/editor/Layout3DEditor.tsx
3 src/components/cad/palettes/CadLayerManagerPalette.tsx   (:210, :224, :380)
3 src/components/cad/dialogs/CadDxfExportDialog.tsx
2 src/components/cad/palettes/CadSelectionPalette.tsx      (:138, :151)
1 src/components/ui/Modal.tsx                              (:177)
1 src/components/cad/palettes/CadPropertiesPalette.tsx     (:120)
1 src/components/cad/palettes/CadHatchPalette.tsx          (:67)
1 src/components/cad/palettes/CadDynamicInput.tsx          (:169)  ← la entrada dinámica
1 src/components/cad/command-line/CadCommandLine.tsx       (:219)  ← la línea de comandos
… (styles, draft status bar, draft settings, lisp, studio dialogs)
```

Que la **línea de comandos** y la **entrada dinámica** —los dos controles por los que
pasa todo el trabajo del teclado— estén en esa lista es lo peor de la lista.

**Y hay 16 más que el trinquete no cuenta.** El gate acepta como sustituto cualquier
`ring-*` (`foco-visible.spec.ts:37-38`), pero **no lo mide**. El sustituto que se usa es
`focus:ring-indigo-500/40`, 16 veces
(`grep -rn "ring-indigo-500/40" apps/web/src --include=*.tsx | wc -l → 16`, en
`Layout3DEditor`, `CadLayerManagerPalette`, `CadPropertiesPalette`,
`CadStyleManagerPalette`, `CadVersionsDialog`, `CadStudioDialogs`, `CadIncidentReporter`).
Lo calculé con la aritmética del propio repo (`scripts/design/contrast.mjs`) sobre los
tokens reales de `globals.css` (`--surface`, `--background`):

```
OSCURO  fondo del control [27,25,25]   anillo [56,56,111]   ratio 1.64:1
CLARO   fondo del control [253,253,252] anillo [191,193,248] ratio 1.69:1
```

**WCAG 1.4.11 exige 3:1.** Los dos fallan por casi la mitad. Es decir: **43 controles**
del estudio, no 27, no tienen indicador de foco utilizable — y el hueco está justo en la
intersección de los dos gates: `check-contrast.mjs` no lo ve porque `indigo-500` no es
un token de la hoja, y `foco-visible.spec.ts` no lo ve porque hace `regex`, no
fotometría.

- **Por qué duele:** en el estudio, quien navega con teclado no sabe dónde está. Y no es
  un caso hipotético: el propio `teclado-embudo.spec.ts:96-125` comprueba eso mismo
  en `/dashboard` — la comprobación existe, sólo que no se aplica al editor.
- **Coste:** un día.
- **Cómo se construye:** (a) sustituir `focus:ring-indigo-500/40` por el `focusRing`
  tokenizado de `components/ui/styles.ts` en los 16 sitios; (b) añadir a
  `check-contrast.mjs` la fila «anillo de foco de un campo de paleta sobre `--surface`»
  con mínimo 3:1; (c) bajar `foco-visible-budget.json` de 27 según se saquen paletas a
  su componente, como ya dice su propia nota.
- **Cómo se verifica:** `npm run check:contrast` con la fila nueva + una extensión de
  `teclado-embudo.spec.ts` que haga el barrido de 25 tabulaciones **dentro de `/demo`**
  con la paleta de capas abierta.

### H4 · A 200 % de zoom desaparecen el gestor de capas y las propiedades (alta)

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:15482` y `:16403`:

```
max-[1100px]:hidden
```

y `CadSmallScreenNotice.tsx:38` lo declara: `CAD_DOCK_BREAKPOINT_PX = 1100`.

En un monitor de 1920 px al **200 % de zoom del navegador** el viewport CSS es 960 px:
por debajo del umbral. Los dos muelles laterales —capas, propiedades, biblioteca— se
ocultan. Eso es **pérdida de funcionalidad al 200 %, WCAG 1.4.4 (Resize Text, AA)
incumplido**.

Y el aviso da el consejo equivocado a esa persona
(`CadSmallScreenNotice.tsx:89-93`): «aparecen solos en un equipo con más ancho». Quien
usa el zoom **tiene** pantalla de sobra; lo que necesita es texto grande. El aviso está
escrito para el móvil y se pinta también para el zoom.

- **Coste:** varios días (es maquetación del monolito).
- **Cómo se construye:** cambiar el criterio de `px` a `rem` —`max-[68.75rem]:hidden`
  no se dispara al hacer zoom porque el `rem` crece con él— y, para el caso realmente
  estrecho, convertir los muelles en paneles superpuestos invocables (`Ctrl+1`/`Ctrl+8`
  ya existen en `editor-keyboard.ts`) en vez de ocultarlos.
- **Cómo se verifica:** un golden con `viewport: 1920×1080` y
  `page.evaluate(() => document.body.style.zoom = '200%')` —o mejor, viewport 960×540
  con `deviceScaleFactor: 2`— que exija que `cad-layer-manager` sigue alcanzable.

### H5 · El estudio no tiene un solo landmark (alta)

```
$ grep -n "<main\|<nav\|<aside\|role=\"region\"\|role=\"toolbar\"\|role=\"menubar\"" \
    apps/web/src/components/cad/editor/Layout3DEditor.tsx \
    apps/web/src/components/cad/CadStudioHost.tsx \
    apps/web/src/components/cad/ribbon/*.tsx
(sin salida)
```

18.453 líneas de editor, **cero landmarks**. El `<main>` que hay en
`apps/web/src/app/studio/[documentId]/page.tsx:102` envuelve sólo la pantalla de error;
el estudio de verdad se monta sin él. Tampoco hay `SkipLink`: existe
(`apps/web/src/components/SkipLink.tsx`) y se usa **sólo en páginas de marketing**
(`page.tsx:337`, `plantillas/page.tsx:37`, `seguridad/page.tsx:141`, `casos-de-uso/page.tsx`);
ni el estudio ni el tablero lo montan.

Combinado con el tamaño de la cinta, esto es caro. Conté los botones ejecutando
`lib/cad/ribbon.ts`:

```
inicio 159 · insertar 29 · anotar 35 · parametrico 21 · vista 20 · salida 14
· administrar 22   →  TOTAL 300 botones
```

`CadRibbonButton.tsx` no pone `tabIndex`, así que **los 159 botones de la pestaña
Inicio son parada de tabulación**. Sin skip-link y sin landmarks, llegar desde el
principio del documento a la línea de comandos son ~160 pulsaciones de Tab.

axe no lo caza y se puede explicar exactamente por qué: la regla `region` de axe-core
tiene impacto **moderate**, y `axe-estudio.spec.ts:30-39` filtra a
`serious|critical` y sólo imprime las moderadas por consola. El gate está verde y el
defecto está ahí.

- **Coste:** un día.
- **Cómo se construye:** `<SkipLink target="#lienzo" />` + `<SkipLink target="#linea-de-comandos" />`
  al principio de `CadStudioHost`; `role="toolbar"` con `aria-label` y **tabindex móvil**
  (roving) en `CadRibbonPanel` para que la cinta sea UNA parada y las flechas muevan
  dentro; `<main id="lienzo">` alrededor del `cad-canvas`; `role="complementary"` con
  `aria-label` en los dos muelles.
- **Cómo se verifica:** extender `axe-estudio.spec.ts` para que `region` y
  `landmark-one-main` fallen aunque sean moderate (lista explícita de reglas
  «moderadas que aquí sí bloquean»), y un caso de teclado que exija que el
  primer Tab desde el documento llegue al skip-link y el segundo al lienzo.

### H6 · El lienzo no existe para un lector de pantalla, y la lista de entidades se corta en 20 (alta)

`Layout3DEditor.tsx:15776-15779` monta el área de dibujo como un `<div>` y
`renderer.domElement` se inyecta en `mountRef` (línea 6019) **sin `tabindex`, sin
`role`, sin `aria-label`**. `grep -n "tabIndex" Layout3DEditor.tsx` → sin salida en
18.453 líneas.

La única representación textual del dibujo es
`apps/web/src/components/cad/palettes/CadNativeEntityList.tsx`, que está bien pensada
(nombres legibles «Muro 1 · Muros» en vez de `cad_mt60y4ol_uzfo`) pero:

```tsx
limit = 20,                                   // línea 42
const visibles = entities.slice(0, limit);    // línea 55
… <p>y {ocultas} más</p>                      // línea 92
```

En un plano de 300 entidades, **280 son inalcanzables** por teclado y por lector de
pantalla. El comentario de la línea 90 dice «un corte silencioso es una mentira
pequeña» y declara el resto — pero declararlo no lo hace alcanzable. Tampoco hay
`role="list"`/`listitem` ni `aria-label` de grupo.

- **Por qué duele:** hoy no hay ninguna forma de recorrer el dibujo sin ratón. LINE
  dibuja a ciegas; nada permite *inspeccionar* lo dibujado.
- **Coste:** varios días.
- **Cómo se construye:** ver §5 — es la mitad de la apuesta ganadora.

### H7 · El conmutador de idioma está escondido dentro del estudio (media)

`grep -rn "LanguageSwitcher" apps/web/src --include=*.tsx` da **dos** resultados: su
definición y **un** montaje, `CadWorkspaceDock.tsx:302`. Es decir: para cambiar de
idioma hay que abrir el estudio y desplegar el muelle de espacio de trabajo.

La landing, `/login`, `/register`, `/precios` y `/dashboard` **no tienen conmutador**.
Y el propio componente documenta lo contrario
(`LanguageSwitcher.tsx:21-22`): «"segmented" (default): […] Para landing/login.
"compact": […] para el header del dashboard». La variante `segmented` no se usa en
ningún sitio.

- **Por qué duele:** el idioma por defecto es inglés, la landing está en español, y no
  hay botón para arreglarlo hasta después de registrarse y abrir un plano.
- **Coste:** horas.
- **Cómo se construye:** montar `<LanguageSwitcher />` en `PublicNav.tsx` y en la
  cabecera del tablero. Es una línea en cada sitio.
- **Cómo se verifica:** `axe-superficies.spec.ts` ya recorre esas rutas; añadir
  `expect(page.getByRole('group', { name: /idioma|language/i })).toBeVisible()`.

### H8 · Formatos de número y fecha cableados a `es-MX` en el sitio más caliente (media)

`apps/web/src/i18n/config.ts:48` declara `localeIntlTag: { en: "en-US", es: "es-MX" }`
y **nadie lo importa**: `grep -rn "localeIntlTag" apps/web/src` da un solo resultado,
su propia definición. Es código muerto.

En su lugar hay **49 etiquetas de locale escritas a mano** y 41 llamadas a
`Intl`/`toLocaleString` (`grep -rn "'es-MX'\|\"es-MX\"\|\"en-US\"" … | wc -l → 49`).
Las más caras:

- `Layout3DEditor.tsx:16138` — `locale: "es-MX"` **pasado a mano a la entrada
  dinámica**, esquivando el módulo de región entero.
- `Layout3DEditor.tsx:3072, 3076, 7186, 7187, 7428, 7539, 16964` — `fmtDist(…)` y
  `fmtArea(…)` **sin el tercer argumento `region`**, que por defecto es
  `DEFAULT_REGION_PROFILE` = México (`studio/format-units.ts:34`). Es la lectura viva de
  medida mientras se dibuja. `CadDesignReportDialog.tsx:304` **sí** lo pasa, así que
  dentro del mismo estudio la misma magnitud se formatea con dos criterios.
- `apps/web/src/app/manifest.ts:30` — `lang: "es-MX"` en el manifiesto PWA, con el
  producto en `defaultLocale: "en"`.
- `apps/web/src/lib/seo/page-metadata.ts:43` — `locale: "es_MX"` en OpenGraph, y
  `alternates: { canonical: url }` **sin `languages` / `hreflang`** (línea 33), así que
  Google no sabe que hay dos idiomas.
- `apps/web/src/app/global-error.tsx:36` — `<html lang="es-MX">` fijo.

- **Coste:** un día.
- **Cómo se construye:** un `RegionProvider` (contexto React) sembrado por
  `region/server.ts` en `layout.tsx` y consumido por `useRegion()`; sustituir los 49
  literales por el perfil. `region/format.ts` ya tiene las cuatro funciones.
- **Cómo se verifica:** un gate `check:no-hardcoded-locale` (hermano de
  `check:no-industrial-domain`) que falle ante `es-MX`/`en-US`/`es-ES` literal fuera de
  `lib/cad/region/profiles.ts`; y una spec que fije el techo actual (49) y sólo lo baje.

### H9 · El diálogo de la línea de comandos no se puede desplazar (media)

`CadCommandLine.tsx:168`:

```
className="pointer-events-none max-h-24 overflow-y-auto px-2 py-1 font-mono leading-snug"
```

`overflow-y-auto` con `pointer-events-none` y **sin `tabIndex`**: no se puede desplazar
con la rueda (el puntero no llega), no se puede desplazar con el teclado (no recibe
foco), y sólo se autodesplaza al final (línea 79). El historial guarda 60 líneas
(`command-engine-host.ts:144`) y **ninguna de las que no cabe en `max-h-24` (~4 renglones)
es recuperable**.

Tampoco hay ventana de texto: `TEXTSCR` no está en el registro y F2 no está en
`keyboard-shortcuts.ts` (`grep -rn "TEXTSCR\|key: \"f2\"" apps/web/src/lib/cad → 0`).
En AutoCAD, F2 es el gesto reflejo para leer lo que acaba de decir un `LIST`, un `AREA`
o un `MASSPROP` — y `LIST` aquí puede volcar quince renglones
(`command-engine-host.ts:296-302` lo dice explícitamente).

Además, cuando ese contenedor **sí** desborda, axe dispara
`scrollable-region-focusable`, que es **serious** — pero el gate lo audita en `/demo`
recién abierto, con el log vacío, así que nunca desborda y el gate pasa.

- **Coste:** horas.
- **Cómo se construye:** `tabIndex={0}` en el `role="log"` (le da foco y desplazamiento
  por teclado) y quitarle el `pointer-events-none` de encima sólo a él, dejando el resto
  del muelle transparente; añadir `TEXTSCR` al registro con F2 en `keyboard-shortcuts.ts`
  abriendo el historial completo en el `CadDialogShell` que ya existe.
- **Cómo se verifica:** golden que ejecute 40 órdenes, pulse F2 y afirme que la primera
  sigue leyéndose; y ampliar `axe-estudio.spec.ts` para auditar **después** de llenar el
  log, no sólo con el editor recién abierto.

### H10 · Sin `prefers-reduced-motion` en el visor 3D (media)

La regla global de `globals.css:591` sólo apaga animaciones **CSS**. El visor anima con
`requestAnimationFrame` y `three.js`, y ahí no hay consulta:

```
$ grep -rn "prefers-reduced-motion\|reducedMotion" apps/web/src/lib/cad apps/web/src/components/cad
(sin salida)
```

Mitiga bastante que `camera-policy.ts:146` ponga `controls.enableDamping = false`
(la cámara no planea al soltar) — eso ya es una decisión pro-reducción de movimiento,
aunque se tomó por fidelidad a AutoCAD y no por accesibilidad. Lo que sigue moviéndose
sin preguntar son las transiciones del ViewCube (`camera-view-presets.ts`) y el
`fitView`.

- **Coste:** horas.
- **Cómo se construye:** un `cadPrefiereMenosMovimiento()` en `camera-policy.ts` que
  lea `matchMedia("(prefers-reduced-motion: reduce)")` y haga que los presets de vista
  y el `fitView` **salten** al encuadre final en vez de interpolar.
- **Cómo se verifica:** spec de `camera-policy` con el `matchMedia` inyectado, más el
  golden del ViewCube corriendo con `page.emulateMedia({ reducedMotion: 'reduce' })`.

### H11 · Un solo Escape cierra dos cuadros a la vez (media)

`CadDialogShell.tsx:73-77`:

```ts
const alPulsar = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    onClose();
    return;
  }
  …
};
document.addEventListener("keydown", alPulsar, { capture: true });
```

Los cuadros del estudio se montan con banderas de estado **independientes**
(`Layout3DEditor.tsx:18306 {takeoff && …}`, `:18319 {showDxfExport && …}`,
`:18335 {report && …}`, `:18365`, `:18387`, `:18400`), así que nada impide que haya dos
a la vez. Con dos montados hay **dos listeners de captura en el mismo nodo
(`document`)**, y `stopPropagation()` no detiene a un hermano en el mismo nodo — eso
requiere `stopImmediatePropagation()`. Resultado: un Escape cierra los dos. Lo mismo
para Tab: los dos hacen `preventDefault()` y `first.focus()`, y el foco rebota.

Y hay un segundo efecto, más frecuente: `CadDialogShell.tsx:113` guarda
`restoreRef.current = document.activeElement` al montar. Si el cuadro lo abrió una orden
tecleada, `CadCommandLine.tsx:113` ya hizo `inputRef.current?.blur()` antes de despachar,
así que `document.activeElement` es `<body>`; al cerrar, `body.focus()` no hace nada y
**el foco vuelve al principio del documento**.

- **Coste:** horas.
- **Cómo se construye:** una pila de cuadros en un contexto (`CadDialogStack`) donde
  sólo el último atiende Escape y Tab; y guardar el `restoreRef` desde el invocador
  (el botón de la cinta o la caja de comandos) en vez de leer `activeElement`, cayendo
  a la caja de comandos cuando no haya nada.
- **Cómo se verifica:** extender la comprobación de trampa de foco de
  `axe-estudio.spec.ts:68-81` a **dos cuadros apilados**, y afirmar que tras cerrar el
  de dentro el foco está en el de fuera.

### H12 · La región viva vuelve a leer las 60 líneas cuando el log se llena (media)

`CadCommandLine.tsx:170-174`:

```tsx
{history.map((entry, index) => (
  <div key={`${index}-${entry.text}`} …>
```

La clave lleva el **índice**. El historial se recorta con
`.slice(-MAX_HISTORY)` (`command-engine-host.ts:309`, `MAX_HISTORY = 60`), así que a
partir del renglón 61 el array **se desliza** y el texto de cada índice cambia →
todas las claves cambian → React desmonta y remonta los 60 `<div>`.
Para un `aria-live="polite"` eso son 60 nodos nuevos, y el lector de pantalla
**vuelve a leer el diálogo entero cada vez que se ejecuta una orden**.

- **Coste:** horas (una línea, más la prueba).
- **Cómo se construye:** dar a cada entrada del log un `seq` monótono en
  `command-engine-host.ts` y usarlo de clave.
- **Cómo se verifica:** una spec de componente que renderice 61 entradas, empuje una
  más y compruebe que sólo un nodo cambia de identidad (por ejemplo comparando
  referencias con `MutationObserver` en jsdom).

### H13 · El texto que el lector de pantalla no oye: `title` como única pista (baja)

`Layout3DEditor.tsx` tiene **76** atributos `title=` y **4** `aria-label`.
Los botones de la cinta salvan la papeleta porque llevan el nombre visible
(`CadRibbonButton.tsx:59-61` pinta `{command.name}`), pero el `summary` —la única prosa
que explica qué hace `SETBYLAYER`— viaja sólo por `title` y por un `Tooltip` que está
`aria-hidden="true"` (`Feedback.tsx:104`). El comentario de `Feedback.tsx:90-91` justifica
ese `aria-hidden` diciendo «el texto ya viaja al lector de pantalla por el `aria-label`
del control», y para la cinta eso no es cierto: no hay `aria-label`.

Además el `Tooltip` no cumple **WCAG 1.4.13**: no se descarta con Escape y es
`pointer-events-none`, así que no se puede pasar el ratón por encima.

- **Coste:** horas. `aria-describedby` apuntando al nodo del tooltip y quitarle el
  `aria-hidden`; `onKeyDown` de Escape en el envoltorio.

### H14 · Sin RTL, sin `dir`, y la arquitectura lo va a cobrar (baja, pero estructural)

No hay un solo `dir=` en el árbol, ni lógica bidi. Con `en`/`es` da igual. Lo que
importa es la decisión de arquitectura: `i18n/config.ts:1-11` explica que se eligió
cookie **en vez de** segmento `[locale]` porque «reescribir 113 rutas sería invasivo».
Es una decisión defendible hoy y una deuda mañana: sin segmento de idioma no hay URL
por idioma, no hay `hreflang` que valga, y el SSR tiene que marcar toda página como
dinámica por leer la cookie (el propio `sin-conexion/page.tsx:53` lo apunta).

- **Cómo se construye cuando toque:** `dir` derivado del `Locale` en `layout.tsx:128`
  (`dir={localeDir[locale]}`), propiedades lógicas de CSS (`margin-inline`, `inset-inline`)
  en lugar de `left/right` —hay 200+ usos de `left-`/`right-` en el estudio—, y el
  lienzo exento (un plano no se refleja).

### H15 · Sin soporte de `forced-colors` (baja)

`grep -rn "forced-colors\|prefers-contrast" apps/web/src` → sin salida. En modo alto
contraste de Windows, la interfaz del estudio (bordes `border-border`, superficies
`bg-surface/90`) queda plana. AutoCAD hereda el tema del sistema.

---

## 4 · Defectos de código, con su sitio

| # | Dónde | Qué |
|---|---|---|
| D1 | `lib/cad/engine/commands/draw-pline.ts:55` | `UNDO shortcut "H"` colisiona con `Halfwidth` de AutoCAD inglés: quien teclea `H` borra un vértice. 550 palabras clave con el mismo problema. |
| D2 | `lib/cad/engine/command-types.ts:73-78` vs los 550 sitios | El contrato dice `keyword` canónico inglés + `label` localizable; se usa al revés y `label` aparece 12 veces de 550. |
| D3 | `src/i18n/config.ts:48` | `localeIntlTag` exportado y **nunca importado**: código muerto, mientras 49 literales de locale se escriben a mano. |
| D4 | `components/cad/editor/Layout3DEditor.tsx:16138` | `locale: "es-MX"` cableado a la entrada dinámica, esquivando `lib/cad/region`. |
| D5 | `Layout3DEditor.tsx:3072,3076,7186,7187,7428,7539,16964` | `fmtDist`/`fmtArea` llamados sin `region`; caen a México. La misma magnitud se formatea distinto que en `CadDesignReportDialog.tsx:304`. |
| D6 | `components/cad/dialogs/CadDialogShell.tsx:75` | `stopPropagation()` en un listener de **captura sobre `document`**: no detiene al hermano en el mismo nodo. Con dos cuadros abiertos, un Escape cierra los dos. Falta `stopImmediatePropagation()` + pila de cuadros. |
| D7 | `CadDialogShell.tsx:113` | `restoreRef = document.activeElement`; cuando el cuadro lo abre una orden tecleada eso es `<body>` (por el `blur()` de `CadCommandLine.tsx:113`), y al cerrar el foco se va al principio del documento. |
| D8 | `components/cad/command-line/CadCommandLine.tsx:171` | Clave de React con **índice** sobre un array que se desliza (`slice(-60)`): a partir del renglón 61 la región `aria-live` remonta 60 nodos y el lector relee todo el diálogo en cada orden. |
| D9 | `CadCommandLine.tsx:168` | Región desplazable (`overflow-y-auto`) con `pointer-events-none` y sin `tabIndex`: no se desplaza ni con rueda ni con teclado. Y cuando desborda, dispara `scrollable-region-focusable` (serious) en un sitio que el gate no audita. |
| D10 | `components/cad/palettes/CadNativeEntityList.tsx:42,55` | `limit = 20` con corte duro: en un plano de 300 objetos, 280 no son alcanzables por teclado ni por lector de pantalla. |
| D11 | `Layout3DEditor.tsx:15482` y `:16403` | `max-[1100px]:hidden` en píxeles: al 200 % de zoom desaparecen capas y propiedades (WCAG 1.4.4). El aviso de `CadSmallScreenNotice.tsx:89` da el consejo equivocado a ese usuario. |
| D12 | `Layout3DEditor.tsx:6019` / `:15777` | El `<canvas>` de three.js se inyecta sin `tabindex`, `role` ni `aria-label`. Cero `tabIndex` en 18.453 líneas. |
| D13 | `components/ui/foco-visible.spec.ts:37` | El gate acepta `ring-*` por regex sin medirlo; los 16 `focus:ring-indigo-500/40` dan **1,64:1** (oscuro) y **1,69:1** (claro) frente al 3:1 de WCAG 1.4.11. El trinquete dice 27 y la cifra real es 43. |
| D14 | `components/ui/Feedback.tsx:104` + `ribbon/CadRibbonButton.tsx` | El `Tooltip` es `aria-hidden` «porque el texto ya va en el `aria-label` del control»; los botones de la cinta no tienen `aria-label`, así que el `summary` no llega a nadie. Y el tooltip no se descarta con Escape (WCAG 1.4.13). |
| D15 | `src/app/manifest.ts:30`, `lib/seo/page-metadata.ts:43`, `src/app/global-error.tsx:36` | `lang: "es-MX"`, `locale: "es_MX"` y `<html lang="es-MX">` fijos, con `defaultLocale = "en"`. Y `alternates` sin `languages`/`hreflang`. |
| D16 | `lib/cad/engine/alias-table.ts:9-12` | El comentario justifica no traducir los nombres con una premisa falsa sobre AutoCAD; el propio archivo ya implementa el `_` (línea 309) que resuelve el dilema que dice tener. |
| D17 | `components/ui/LanguageSwitcher.tsx:21-22` | La documentación dice «para landing/login» y «para el header del dashboard»; el único montaje del árbol es `CadWorkspaceDock.tsx:302`, dentro del estudio. La variante `segmented` no se usa nunca. |
| D18 | `lib/cad/region/resolve.ts:75-83` | `matchRegionTag` compara la etiqueta **completa** contra `numberLocale`, así que `en-GB`, `es-AR`, `es-CO`, `pt-BR` no casan y caen a México. Bastaría comparar también sólo la subetiqueta de región. |

---

## 5 · La apuesta ganadora

> **El plano como documento navegable: un árbol de entidades por teclado, anunciado,
> con la selección sincronizada con el lienzo.**

Es lo único de esta dimensión que puede hacer que alguien **prefiera** Valle sobre
AutoCAD, y no sólo lo tolere.

**Por qué gana.** AutoCAD es, en accesibilidad, un producto de 1982 con una capa de
Win32 encima: el área de dibujo es un HWND opaco, no hay UI Automation sobre las
entidades, no hay forma de que NVDA o JAWS te digan qué hay dibujado. Autodesk publica
sus VPAT y el área de dibujo aparece como «no compatible». **Nadie ha hecho nunca un
CAD que un lector de pantalla pueda recorrer**, y en la web se puede: el DOM es
accesible por construcción.

**Y aquí ya está medio construido.** No es una idea: son tres piezas que existen.

1. `CadNativeEntityList.tsx` ya convierte `cad_mt60y4ol_uzfo` en «Muro 1 · Muros» con
   ordinales calculados sobre el plano completo (`cadEntityLabels`).
2. `CadCommandLine.tsx:159-161` ya tiene `role="log"` + `aria-live="polite"` cableado al
   motor (`command-engine-host.ts:714`), así que **el canal de voz ya funciona**.
3. `golden/44-cad-command-line.spec.ts` ya demuestra que se dibuja sin ratón.

Lo que falta es el puente entre lo que se dibuja y lo que se puede recorrer.

**Diseño concreto.**

- Módulo nuevo `apps/web/src/lib/cad/a11y/document-outline.ts`, puro: recibe
  `CadDocument` y devuelve
  `OutlineNode = { id, kind, label, layer, children?, bbox, summary }`, agrupado por
  **capa → tipo → entidad** (que es como un dibujante organiza su plano, y ya es el eje
  que la lista pinta a la derecha). El `label` sale de `cadEntityLabels`, que ya existe;
  el `summary` sale de las funciones de `lib/cad/inquiry/` que ya calculan longitud,
  área y coordenadas —«Muro 1, capa MUROS, de 0,0 a 2000,0, 2.000 mm».
- Componente `CadDocumentOutline.tsx` con el patrón ARIA `treeview`
  (`role="tree"` / `role="treeitem"` / `aria-expanded` / `aria-selected`), **tabindex
  móvil** (una sola parada de tabulación, flechas para moverse) y sin límite de 20:
  virtualizado, porque a 100k entidades el DOM no aguanta —el repo ya tiene
  `lib/cad/render` con nivel de detalle e índice espacial, así que la virtualización
  puede reusar el mismo criterio.
- Orden `TREEVIEW` (alias `ARBOL`) en `command-manifest.ts`, `transparent: true`,
  `mutates: false`, más `Ctrl+Shift+O`. Enfocar un nodo **encuadra el lienzo sobre él**
  (`fitView` ya existe) y lo designa por el mismo camino que un clic
  (`onSelect` de la lista actual ya despacha ahí).
- El puente inverso: al designar con el ratón, el nodo correspondiente recibe
  `aria-selected` y se anuncia por la región viva que ya existe.
- Y la pieza que lo convierte en producto, no en cumplimiento: **el mismo árbol sirve
  a quien ve**. Es lo que en AutoCAD sería un «Selector de objetos» que no existe —
  buscar «todos los MTEXT de la capa NOTAS», saltar a la cota que el informe de
  revisión señaló, recorrer los 34 tramos que `74-cad-prueba-de-despacho.spec.ts`
  cose. Se vende como productividad y se cobra como accesibilidad.

**Cómo se verifica.**

- Golden nuevo, **sin ratón**: abrir un plano ajeno, `Ctrl+Shift+O`, bajar con flechas
  hasta «Muro 3», `Enter`, y afirmar sobre el DOCUMENTO que la selección del servidor
  es `muro-3` y que el encuadre lo contiene.
- Spec de árbol contra `axe-core` con la regla `aria-required-children` incluida.
- Una spec que exija que **toda** entidad del documento tiene nodo: `outline(doc)`
  aplanado tiene la misma cardinalidad que `doc.entities`. Es la prueba que mata el
  `limit = 20`.
- Y la afirmación que hace la diferencia: recorrer el árbol de un plano de 300 objetos
  y comprobar que el número de paradas de tabulación **es una**, no 300.

Coste: dos a tres semanas. Es la única cosa de esta dimensión que, terminada, se puede
enseñar a un cliente y que AutoCAD no puede contestar.
