# Informe — Región configurable

**Fecha:** 2026-08-31 · **Repositorio:** `valle-design` ·
**Rama:** `claude/region-configurable` · **Base:** `main`

Encargo: que Valle Design pueda venderse fuera de México sin tocar código. Hoy la
convención regional (locale de número/fecha, sistema de unidades, papel, norma de
acotación) estaba incrustada a mano en decenas de sitios — a veces como `"es-MX"`
fijo, a veces como `"es-ES"` fijo (el defecto que corrigió el PR #125), y a veces
como un `toLocaleString()`/`toLocaleDateString()` sin locale, que no falla nunca:
sigue al idioma del navegador de quien mira, así que el mismo documento se ve
distinto según quién lo abra. Las tres formas son el mismo defecto: la región no
era un dato del sistema.

---

## 1. Lo que se construyó

`apps/web/src/lib/cad/region/` — módulo puro, sin dependencias del editor ni de
Next.js en su núcleo (`types.ts`, `profiles.ts`, `resolve.ts`, `format.ts`),
con dos adaptadores finos (`server.ts` para Server Components, `client.ts` para
Client Components) que son los únicos archivos del módulo que tocan
`next/headers` o `document`/`navigator`.

Resuelve, en un solo lugar, con **México como default explícito y declarado**
(`DEFAULT_REGION_CODE = "MX"` en `profiles.ts`, no una constante escondida):

| Eje | Campo | México | España | Estados Unidos |
| --- | --- | --- | --- | --- |
| Locale de número | `numberLocale` | `es-MX` | `es-ES` | `en-US` |
| Locale de fecha | `dateLocale` | `es-MX` | `es-ES` | `en-US` |
| Sistema de unidades | `measurementSystem` | métrico | métrico | imperial |
| Serie de papel | `paperSeries` | ISO A | ISO A | ANSI |
| Papel por defecto | `defaultPaper` | A4 | A4 | letter |
| Familia de norma de acotación | `dimensionStandardFamily` | ISO | ISO | ASME |

Tres perfiles hoy — `MX`, `ES`, `US` — porque son las tres convenciones que se
encontraron incrustadas a mano en el código, no porque el producto esté
limitado a tres países: añadir una región nueva es añadir una entrada a
`REGION_PROFILES`, y ningún consumidor cambia porque todos leen por
`RegionCode`, nunca por un locale literal.

Probado por **resultado**, no por el nombre del locale (`region/region.spec.ts`,
29 aserciones): el criterio que ya exigía `locale-es-mx.spec.ts` — un spec que
sólo comparara la cadena `"es-MX"` pasaría con `es-AR`, que formatea como
España — se conserva y se generaliza. `locale-es-mx.spec.ts` se queda tal cual
como el candado del defecto concreto que se encontró (el motor respondiendo en
la convención de otro país), y ahora además prueba que `formatMagnitude` es
configurable pidiendo explícitamente el perfil de España.

### El separador decimal de coordenadas

`lib/cad/dynamic-input.ts` ya distinguía qué separador aceptar como decimal al
teclear una coordenada (`1,5` vs `1.5`) a partir de un parámetro `locale` con
DOS defaults distintos según el archivo — `"en-US"` en la función pura,
`"es-MX"` en `CadDynamicInput.tsx` — así que el comportamiento real dependía en
silencio de si el caller pasaba el locale o no. Los dos defaults ahora salen
del mismo sitio (`DEFAULT_REGION_PROFILE.numberLocale`), y la propia lógica de
tolerancia de entrada (aceptar coma como decimal en locales `es`/`de`) no se
tocó: es una decisión de producto ya probada (`dynamic-input.spec.ts`), no un
bug de región.

### Sistema de unidades: métrico e imperial de verdad, no sólo el separador

`components/cad/studio/format-units.ts` (`fmtLen`, usado por el panel de
cantidades y el reporte de diseño) ahora responde distinto según
`measurementSystem`: en imperial no convierte a metros y traduce la coma por
un punto — publica en pies-pulgadas (`1'-6 1/2"`) usando el formateador
arquitectónico que ya existía en `lib/cad/unit-format.ts`. Es la diferencia
entre vender fuera de México de verdad y sólo cambiar el separador de una
unidad que ese mercado no usa.

---

## 2. Los consumidores migrados

Regla del repositorio: un módulo que nadie importa no cuenta. Se migraron los
sitios visibles, en orden de lo que el encargo pidió primero:

- **Dashboard**: `app/dashboard/page.tsx` — la fecha de vencimiento de trial es
  literalmente el bug que describe el comentario de `locale-es-mx.spec.ts`
  (`toLocaleDateString()` sin locale, "9/14/2026" en vez de "14/9/2026").
- **Paletas**: `CadDynamicInput.tsx` (entrada dinámica), `CadCollaborationPalette.tsx`
  (checkpoints).
- **Cajetín**: `components/cad/plot/plot-sheet.ts` (`plotSheetModel` — título,
  huella y fecha del cajetín del planificador) y `lib/cad/plot-sheet.ts`
  (`buildPlotSheet` — VD-CAD-PLOT-001, el papel por defecto ahora es `letter`
  cuando la región pasada es de serie ANSI y sigue siendo A3 en cualquier otro
  caso, sin cambiar el comportamiento de quien no pasa región).
- **PDF a escala**: cubierto por lo anterior — el pipeline vectorial real
  (`lib/cad/plot/plot-pdf.ts`) no tenía ningún locale incrustado: el papel ya
  lo lee del `paper-space` de cada documento, no de un default de módulo.
- **Motor CAD**: `engine/commands/solids-support.ts::formatMagnitude`
  (respuestas a MASSPROP/INTERFERE) — con la salvedad de la sección 4.
- **Viewport y HUD**: `lib/cad/world-scale.ts`, `lib/cad/viewport-bookmarks.ts`,
  `components/cad/viewport/scene-objects.ts`.
- **Diálogos**: `CadVersionsDialog.tsx`, `CadDesignReportDialog.tsx`.
- **Cuenta y equipo**: `AccountSecurity.tsx`, `MfaEnrollment.tsx`, `TeamRoom.tsx`,
  `FeedbackAdmin.tsx`, `FeedbackInbox.tsx`.
- **Geo**: `lib/geo/las.ts` (mensaje de error de nube de puntos demasiado
  grande).
- **Marketing**: `CountUp.tsx`, `EngineeringEvidence.tsx` (cifras de evidencia).

Todos con un `region: RegionProfile = DEFAULT_REGION_PROFILE` (o su
equivalente resuelto por cookie) como último parámetro: un caller que no
resuelve la región del visitante ve exactamente el mismo resultado que antes
de esta campaña — cero regresión — y uno que sí la resuelve sólo tiene que
pasarla.

### `Layout3DEditor.tsx` — PROHIBIDO editar, lista para quien lo aplique

El archivo está en reestructuración en otra rama (19 002 → 18 535 líneas) y
esta campaña no lo toca. Cuatro sitios con locale incrustado, línea y
sustitución exacta sobre el HEAD actual de `main`:

| Línea | Código actual | Sustitución propuesta |
| ---: | --- | --- |
| 10970 | `` label: `Pasillo ${Math.round(width).toLocaleString("es-MX")}`, `` | `` label: `Pasillo ${formatRegionNumber(Math.round(width))}`, `` |
| 15544-15545 | `new Date(bookmark.savedAt).toLocaleTimeString(\n  "es-MX",` | `formatRegionDate(new Date(bookmark.savedAt), getClientRegion(), { hour: "2-digit", minute: "2-digit" })` (revisar las opciones que siguen en las líneas 15546+; `toLocaleTimeString` con `hour`/`minute` es equivalente a `toLocaleDateString`/`formatRegionDate` con esas mismas opciones) |
| 16743 | `locale: "es-MX",` | `locale: getClientRegion().numberLocale,` |
| 18032 | `` value={`${Math.round((selSnap.w * selSnap.h) / 1000).toLocaleString("es-MX")}k mm²`} `` | `` value={`${formatRegionNumber(Math.round((selSnap.w * selSnap.h) / 1000))}k mm²`} `` |

Requiere agregar, junto a los demás imports del archivo:

```ts
import { formatRegionNumber, formatRegionDate } from "@/lib/cad/region";
import { getClientRegion } from "@/lib/cad/region/client";
```

Tres sitios más en el mismo archivo (líneas ~12072, ~12075, ~12082,
`.toLocaleLowerCase("es-MX")` para resolver el comando en lenguaje natural
"mover estación X" contra nombres de estación) son fuera de alcance — ver
sección 4.

---

## 3. Persistencia: por qué no hay cookie nueva

El encargo pedía persistir la preferencia por "la cookie `axos_locale` que ya
existe". Lo que hay hoy, verificado en `src/i18n/config.ts` y
`persisted-identifiers.spec.ts`, es más preciso: la cookie **viva** es
`valle_locale`; `axos_locale` es su alias congelado — se sigue **leyendo**
como respaldo (`getUserLocale()` la consulta si `valle_locale` no está) y
nunca se vuelve a **escribir** una vez que el usuario consolida su elección.
Ninguna de las dos se toca ni se renombra en esta campaña.

Esa cookie sólo guarda `"es"` o `"en"` — es idioma de interfaz (next-intl),
con dos valores, no región. No distingue México de España. En vez de inventar
una cookie de región nueva, `resolveRegionCode` (pura, `region/resolve.ts`)
la reutiliza como señal parcial y completa con `Accept-Language`:

1. **`"es"` guardada → México.** Es exactamente lo que el producto hacía hasta
   hoy en todo el código (`es-MX` a mano en cada sitio hispanohablante), así
   que reusar la cookie de idioma para esto no cambia ni una respuesta
   existente.
2. **`"en"` guardada NO implica Estados Unidos.** El inglés es el default de
   la interfaz (`i18n/config.ts`: *"Default = inglés"*) — un visitante con esa
   interfaz no declaró ningún país. Se sigue al paso 3.
3. **`Accept-Language`**, sólo con una etiqueta INEQUÍVOCA (`es-MX`, `es-ES`,
   `en-US` exactos): un idioma sin país (`es`, `en`) o un país sin perfil
   (`en-GB`, `fr-FR`) no cuenta como señal.
4. **México.** Nunca Estados Unidos por silencio: EE. UU. sólo se elige en el
   paso 3, con una etiqueta explícita que lo pida.

`region/server.ts` conecta esto a `cookies()`/`headers()` de Next para
Server Components; `region/client.ts` lee `document.cookie` y
`navigator.languages` (el navegador no expone `Accept-Language` a JS) para
Client Components — la mayoría de los sitios migrados lo son.

**Deuda declarada, no escondida:** hoy sólo hay dos idiomas de interfaz
(`en`/`es`), así que un hispanohablante en España no tiene ningún control en
la UI para pedir explícitamente la convención de su país en vez de la de
México — recibe México salvo que su `Accept-Language` diga `es-ES` sin
ambigüedad. Añadir ese control (un selector de región, no de idioma) es
trabajo futuro; el módulo ya lo soporta (`REGION_PROFILES.ES` existe y está
probado), sólo falta la UI que lo exponga.

---

## 4. Lo que NO se regionalizó, y por qué — inventario honesto

Un inventario honesto vale más que una migración a medias que aparente estar
completa.

### Contenido de arranque mexicano — no es deuda, es la ventaja del producto

`IDENTITY.md`: *"el contenido mexicano ... es la fortaleza inicial del
producto y su mejor diferenciador frente a AutoCAD. No es su límite."*
Internacionalizar esto no tiene sentido de negocio:

- **CFDI** (`apps/api/src/modules/commercial/*cfdi*`): facturación fiscal
  **mexicana** — Comprobante Fiscal Digital por Internet, un requisito legal
  del SAT. No hay una versión "internacional" de un CFDI; un cliente que
  compra desde otro país sencillamente no lo recibe. `billing.ts` y
  `pricing.ts` (`Intl.DateTimeFormat`/`Intl.NumberFormat` fijos en `es-MX`,
  con comentario explícito: *"el producto se vende en español de México,
  con precios en pesos e IVA incluido"*) son la misma decisión de negocio,
  no un bug de región — no se tocaron.
- **Las plantillas mexicanas** (según el encargo, del orden de 149: casa
  habitación, consultorio, taquería, tortillería, notaría) y sus **cajetines**
  con la responsiva del Director Responsable de Obra (RCDF) — catalogadas y
  citadas con su fuente en `lib/cad/standards/mexican-drafting-sources.ts` y
  `lib/cad/standards/mexican-sheets.ts`. Ese registro distingue ya, norma por
  norma y costumbre por costumbre, qué es ISO internacional (`iso-216`,
  `iso-5455-escalas`, ...) y qué es específicamente mexicano (RCDF, NOM). El
  módulo de región no lo sustituye ni lo toca: son la referencia para el
  contenido MEXICANO, mientras que `region/profiles.ts` decide el DEFAULT de
  un dibujo nuevo sin plantilla. Vender fuera de México no borra este
  catálogo — lo deja donde está y añade un default distinto al lado.
- `apps/api/.../seed-furniture.ts`: medidas comerciales de mobiliario del
  mercado mexicano (colchón individual/matrimonial/queen/king). Dato de
  catálogo, no preferencia de usuario.

### Deuda real, declarada y no resuelta en esta campaña

- **El motor de comandos no conoce la región del visitante.**
  `formatMagnitude` ya lee de `region/format.ts`, pero `CadCommandContext`
  (el objeto que atraviesa el pipeline de comandos) no lleva ningún campo de
  región, así que las respuestas a MASSPROP/INTERFERE siguen usando el
  default de México en vez de la región resuelta de quien pregunta. Cambiar
  esto exige extender `CadCommandContext` y probablemente cada comando que lo
  recibe — más blast radius del que esta campaña se propuso mover para un
  mensaje de consulta.
- **`buildPlotSheet` (VD-CAD-PLOT-001) y `plotSheetModel` no tienen ningún
  consumidor de producción hoy** — sólo sus propios specs los llaman (`grep`
  verificado). Se migraron igual porque son la pieza correcta para "cajetín y
  PDF a escala" el día que se conecten, pero conectarlos a una UI real es
  trabajo pendiente **anterior** a esta campaña, no algo que ella introduce.
- **No hay selector de región en la interfaz.** Ver sección 3: el único
  control hoy es el switch de idioma EN/ES, que no es lo mismo que región.
- **Vocabulario de comandos en español** (`lib/cad/commands/{parser,targets,
  validators,info,parse-helpers}.ts`, `nl-quality/harness.ts`,
  `docs/api/ApiConsole.tsx`): usan `.toLocaleLowerCase("es-MX")` para plegar
  mayúsculas/acentos al reconocer un comando o buscar en la consola de API.
  **No se migraron a propósito**: es plegado de texto del vocabulario de
  comandos, que sigue siendo español en cualquier región (el producto no
  traduce sus comandos), no una convención de formato numérico o de fecha.
  Cualquier variante `es-*` pliega igual para este propósito.
- **`i18n/config.ts::localeIntlTag`** (mapa `en → en-US`, `es → es-MX`) no se
  tocó y sigue sin ningún consumidor propio (verificado con `grep`) — es deuda
  preexistente a esta campaña, no generada por ella.
- **SEO y metadata estática** (`lib/seo/structured-data.ts::inLanguage`,
  `app/manifest.ts::lang`, `app/global-error.tsx`, `app/novedades/page.tsx`,
  cuyo propio comentario dice *"misma cadena para todos"*): declaran el
  **idioma del contenido** de páginas públicas que hoy sólo existen en
  español, o están renderizadas estáticamente a propósito. No es el eje de
  región (formato de número/fecha/unidad) y conectarlas a `next/headers`
  para leer región por visitante forzaría render dinámico en páginas que hoy
  son estáticas — un costo que esta campaña no estaba pidiendo pagar.

---

## 5. Gates

`npm ci && npm run check:cad && npm run check:dwg && npm run typecheck &&
npm test && npm run lint && npm run build` — corridos sobre el árbol
committeado. `check:dwg-evidence` falla igual en `main` limpio (falta
`VALLE_DWG_CORPUS_MIRROR`, no es de esta campaña). El `typecheck` de
`apps/web` reporta 77 errores preexistentes (módulos `@valle/design-sdk`
sin build, `error: unknown` sin acotar, e2e sin `@playwright/test`
instalado) — el mismo número, verificado, en `main` limpio antes de esta
rama; ninguno está en un archivo tocado por esta campaña.
