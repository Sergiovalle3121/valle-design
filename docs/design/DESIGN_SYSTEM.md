# Sistema de diseño — Valle Design

> La identidad (logotipo, paleta con contrastes medidos, tono de voz) está en
> [`BRAND.md`](BRAND.md). Este documento es cómo se construye una pantalla.

---

## La regla de oro

> **Ningún hex fuera de `globals.css`. Ningún tamaño fuera de la escala.**

No es una preferencia estética: es la respuesta a un estado medido. Antes de la
campaña de diseño de agosto de 2026, este repositorio tenía 825 líneas de sistema
de diseño escritas con criterio —tokens semánticos claro/oscuro, tres niveles de
elevación, interletraje por tamaño, escala fluida con `clamp()`— y **cero usos**:
`bg-card` 0, `bg-primary` 0, `text-muted-foreground` 0, `border-border` 0,
`.type-display` 0, `var(--shadow-*)` 0.

En su lugar había 659 tamaños de letra arbitrarios en trece valores (con interfaz
compuesta a 7 px), 327 clases de un acento que el propio CSS prohibía por
escrito, siete radios distintos para el mismo control y 329 botones escritos a
mano con cinco constantes incompatibles.

Un sistema que nadie consume no es un sistema: es documentación. Por eso la regla
tiene un gate, no una convención.

**El gate:** `apps/web/src/components/ui/design-system.spec.ts`. Siete reglas, y
la que de verdad importa no es una prohibición — verifica que los tokens estén
**en uso**. Un gate que sólo prohibiera daría por bueno el estado original.

```bash
npx tsx apps/web/src/components/ui/design-system.spec.ts
```

---

## 1. Dónde vive cada cosa

| Qué                                    | Dónde                                              |
| -------------------------------------- | -------------------------------------------------- |
| Tokens (color, radio, sombra, tracking) | `apps/web/src/app/globals.css`                      |
| Escala tipográfica                      | `globals.css`, en `@layer components`               |
| Primitivas                              | `apps/web/src/components/ui/`                       |
| Geometría de marca                      | `apps/web/src/components/brand/logo-geometry.ts`    |
| Vocabulario compartido de las primitivas | `apps/web/src/components/ui/styles.ts`             |

Se importa siempre por la barrica: `import { Button, Input } from "@/components/ui"`.

---

## 2. Color

### Superficies

| Token                  | Cuándo                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `bg-background`        | El fondo de la página. Una vez por pantalla.                   |
| `bg-card` / `bg-surface` | Todo lo que se apoya encima: tarjeta, panel, paleta, muelle. |
| `bg-popover`           | Lo que flota: menú, tooltip, línea de comandos, modal.         |
| `bg-muted`             | Un escalón de separación: relleno de campo, hover, hueso.      |
| `border-border`        | Todo borde. No hay un segundo color de borde.                  |

### Texto

`text-foreground` para lo que se lee; `text-muted-foreground` para lo secundario.
Ninguno de los dos necesita variante `dark:` — giran solos.

### Estados: relleno y tinta son DOS tokens

Es la trampa de contraste más común, y aquí está resuelta por construcción:

```
bg-success        el RELLENO (badge, barra, punto)
text-success-ink  el TEXTO del mismo estado sobre una superficie normal
```

Reutilizar el color del relleno como color de letra «porque es el mismo estado»
es la forma más común de fallar accesibilidad sin enterarse: en claro, el ámbar
de relleno usado como texto sobre tarjeta da 3,37:1 cuando AA exige 4,5.

> `bg-*` para rellenar, `text-*-ink` para escribir.

Lo mismo con la marca: `bg-brand-strong` para rellenar (**6,93:1** con su letra),
`text-primary-ink` para escribir (**7,72:1** en claro, **5,85:1** en oscuro).

### El gate que lo mide, y por qué manda

```bash
npm run check:contrast     # 35 pares × 2 temas = 70, y falla la corrida entera
```

Se construyó ANTES de cortar la paleta v2 —primero la regla, después el corte— y
encontró dos fallos en el primer intento: un borde claro con 1,23:1 de relieve y
el violeta de hover con 4,21:1 sobre blanco. Cada par lleva escrito QUÉ ES EN
PANTALLA («el pie de una tarjeta», «el anillo de foco sobre la página»), para
que un fallo se pueda arreglar sin abrir el navegador. `--markdown` imprime la
tabla completa.

### El oscuro es el modo por defecto

No es una cortesía nocturna: es el sustrato del oficio, y `system` sigue
existiendo pero ahora se pide. El script anti-parpadeo de `layout.tsx` cae a
oscuro también cuando falla, porque un destello blanco en un producto oscuro es
peor que el contrario.

### La excepción: los colores ACI

`#ff0000`, `#00ff00`, `#00ffff`… son **datos del plano**, no marca: el índice de
color que el usuario asigna a una capa y que decide cómo se traza. No se tocan.
Lo mismo la paleta categórica de celdas del editor.

---

## 3. Tipografía — siete escalones y un piso

| Clase           | Tamaño            | Para qué                                       |
| --------------- | ----------------- | ---------------------------------------------- |
| `.type-display` | clamp 38 → 84 px  | El titular de la portada. Uno por página. **Space Grotesk.** |
| `.type-title`   | clamp 30 → 52 px  | Encabezado de sección. **Space Grotesk.**       |
| `.type-heading` | clamp 19 → 24 px  | Encabezado de tarjeta o subsección. **Space Grotesk.** |
| `.type-lead`    | clamp 16 → 19 px  | Entradilla bajo un titular.                     |
| `.type-body`    | 16 px             | Texto corrido. El tamaño por defecto de lo que se lee. |
| `.type-small`   | 14 px             | Texto secundario, ayudas, pies de ficha.        |
| `.type-caption` | 12 px             | Etiqueta de interfaz densa. El estudio vive aquí. |
| `.type-micro`   | **11 px — el piso** | Barra de estado y etiquetas de paleta. Nunca prosa. |
| `.type-mono`    | hereda            | Cifras, coordenadas, comandos y códigos.        |
| `.type-eyebrow` | 11 px mono caja alta | La etiqueta técnica sobre un titular.        |
| `.type-sheet-number` | 11 px mono, tabular | El número de lámina que numera una sección: `01`, `02`. |

**Tres familias, tres trabajos.** La display (`--font-display`, Space Grotesk)
manda en los tres escalones de encabezado; Inter lleva todo lo que se lee de
corrido; la mono, todo lo que se mide. Con una sola familia un título era texto
grande y nada más — correcto y sin firma. La display se autohospeda igual que
las otras dos: ni una petición a un tercero en tiempo de ejecución, y el gate
`npm run check:fonts` lo comprueba.

**El piso son 11 px y no se negocia.** Por debajo, una grotesca deja de leerse de
un vistazo, y quien dibuja NO se acerca a la pantalla: tiene la mano en el ratón
y la vista en el lienzo. Un estudio puede —debe— ser denso; lo que no puede ser
es ilegible.

**Por qué la escala vive en `@layer components`.** El orden de capas de Tailwind
v4 es `theme, base, components, utilities`. Ahí, una utilidad suelta
(`font-semibold`, `text-lg`) puede sobrescribir un escalón donde de verdad haga
falta. Fuera de capa pasaba lo contrario: `.type-micro font-semibold` habría
salido a peso 500 sin que nadie entendiera por qué. **La escala es el suelo, no
el techo.**

`.type-mono` fuerza `tnum` y `zero`: en una coordenada cotada, distinguir un 0 de
una O no es un detalle, y sin cifras de ancho fijo un contador que pasa de 9 a 10
empuja media línea de interfaz.

---

## 4. Elevación — tres niveles, con nombre de intención

| Clase              | Qué dice                                          |
| ------------------ | ------------------------------------------------- |
| `shadow-resting`   | Apoyado en la página. Aquí vive el 80 % de las tarjetas. |
| `shadow-elevated`  | Se despega: menú, popover, tarjeta bajo el puntero. |
| `shadow-floating`  | Vuela sobre todo: modal, paleta flotante, muelle.  |

Medido antes de la campaña: **29 `shadow-2xl` contra 2 `shadow-sm`**. Casi toda
la interfaz flotaba al máximo, y cuando todo flota nada destaca — la jerarquía se
apaga y la pantalla se lee como un montón de cajas del mismo peso.

Los nombres no coinciden con los de Tailwind a propósito: quien escribe
`shadow-2xl` en un componente sabe que se está saliendo del sistema.

---

## 5. Radio — tres escalones, uno por clase de superficie

| Clase              | Para qué                                        |
| ------------------ | ----------------------------------------------- |
| `rounded-control`  | Botón, campo, ficha, conmutador (≤ 56 px de alto). |
| `rounded-card`     | Tarjeta, panel, paleta, aviso.                   |
| `rounded-surface`  | Modal, marco del producto, sección con fondo propio. |

La regla es de tamaño, no de gusto: cuanto mayor la superficie, mayor el radio
que la hace parecer sólida. Un botón de 40 px con radio 16 es una pastilla; una
tarjeta de 400 px con radio 8 es un diálogo de Windows 95.

Se midieron **siete** radios aplicados al mismo tipo de control. El ojo no lee
siete radios como variedad: los lee como descuido, porque dos controles hermanos
con esquinas distintas parecen venir de dos programas.

---

## 6. Movimiento

### Cinco duraciones y tres curvas, todas con nombre

| Token                  | Valor  | Para qué |
| ---------------------- | ------ | -------- |
| `--duration-instant`   | 90 ms  | Lo que debe sentirse como que ya estaba: un `hover`. |
| `--duration-fast`      | 150 ms | La respuesta de un control al pulsarlo. |
| `--duration-base`      | 240 ms | Lo que entra y sale: paletas, popovers. |
| `--duration-slow`      | 420 ms | Un modal, un panel grande. |
| `--duration-deliberate`| 720 ms | Lo que quiere que lo mires. |
| `--duration-draw`      | 2,6 s  | El trazo que se dibuja solo. |

Curvas: `ease-out-expo` para lo que entra y sale, `ease-spring` para lo que
confirma una acción del usuario, y **`--ease-draw`** para el trazo:
`cubic-bezier(0.65, 0, 0.35, 1)`, una ease-in-out simétrica, porque una plumilla
arranca y para — no aparece a media velocidad ni se corta en seco.

Utilidades: `.motion-instant`, `.motion-fast`, `.motion-base`, `.motion-slow`,
`.motion-confirm`. Un componente no escribe `duration-200`: pide la intención.

### La firma: el trazo que se dibuja solo

`.stroke-draw` y `.stroke-draw-loop` animan `stroke-dashoffset` sobre un `path`
con `pathLength={1}`, y `--draw-delay` escalona los trazos para que el dibujo se
construya en el orden en que lo haría una mano. Es la firma de movimiento del
producto: lo que hace, contado por lo que hace.

### Textura técnica

| Utilidad | Qué pinta |
| -------- | --------- |
| `.blueprint-grid` | La retícula del sustrato: `--grid-fine` (8 px) y `--grid-major` (64 px). |
| `.corner-marks`   | Las marcas de registro de las cuatro esquinas de una lámina. |
| `.construction-line` / `-vertical` | La línea de construcción, con su degradado a los extremos. |
| `.focus-glow`     | El halo del foco sobre fondo oscuro, donde un anillo sólido se pierde. |

### `prefers-reduced-motion`: respetarlo NO es apagarlo

Se respeta en dos capas que ya existían: una regla global en `globals.css` que
neutraliza toda animación y transición CSS, y `useReducedMotion` de Framer
Motion en los componentes que animan con JS.

**Y una excepción que hubo que escribir a mano.** Un trazo animado que
simplemente deja de animarse DESAPARECE: `stroke-dashoffset` se queda en su
valor inicial y el dibujo no llega a verse. La regla fuerza
`stroke-dashoffset: 0` y `opacity: 1` para `.stroke-draw`, `.stroke-draw-loop` y
`.draw-fade-in`. Sin movimiento, el dibujo **completo** — que es lo que la
preferencia pide, no un lienzo en blanco.

Se animan sólo propiedades baratas —color, sombra, opacidad, transformación—
porque animar `height` o `width` obliga al navegador a rehacer el layout en cada
cuadro.

---

## 7. Las primitivas

| Componente                      | Notas de uso                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| `Button`                        | `primary` \| `secondary` \| `ghost` \| `danger` · `sm/md/lg` · `loading` · `iconLeft/Right` · `fullWidth`. Una sola acción `primary` por pantalla. |
| `buttonClass()`                 | La misma piel para un `<Link>`. Vive en `styles.ts` y NO en `Button.tsx`: una función exportada desde un módulo con `"use client"` no se puede invocar desde un componente de servidor. |
| `Input` / `Textarea` / `Select` | `label` obligatorio, `hint`, `error`. El error se enlaza por `aria-describedby`: un error pintado en rojo pero no enlazado NO EXISTE para un lector de pantalla. |
| `Checkbox` / `Switch`           | La casilla dice «se aplicará al enviar»; el conmutador dice «ya está aplicado». Por eso el segundo es `role="switch"`. |
| `Surface` / `Card`              | `elevation` + `radius` + `padded` + **`texture`** (`none` \| `corners` \| `grid`). `as` para elegir la semántica (`article`, `li`, `section`). |
| `PasswordField`                 | Mostrar/ocultar con `aria-pressed`, `autoComplete` correcto y medidor de ENTROPÍA. El medidor informa y no bloquea el envío: la regla de longitud la impone el servidor. |
| `Modal`                         | Foco atrapado, foco devuelto al abridor, scroll bloqueado, Escape cierra, portal a `<body>`. El clic en el velo cierra sólo si EMPEZÓ en el velo. |
| `Badge`                         | Fondo tintado al 10 % y texto a la TINTA del estado. |
| `Tooltip`                       | CSS puro (`group-hover` + `group-focus-within`). Sin estado: dieciocho herramientas serían dieciocho re-renders. |
| `Tabs` / `TabPanel`             | Patrón de teclado WAI-ARIA: flechas cambian de pestaña, Tab SALE de la lista. |
| `Skeleton`                      | Con la silueta de lo que viene, para que al llegar los datos nada se mueva. |
| `EmptyState`                    | Si pintas uno sin `action`, estás pintando un callejón. |
| `Spinner`                       | `border-current`: hereda el color de quien lo contiene. |
| `ProgressBar`                   | Sustituye al `<progress>` nativo, que se pinta distinto en cada sistema operativo. Conserva `role="progressbar"`. |

---

## 8. Accesibilidad — el piso, no el objetivo

- **Contraste AA**: 4,5:1 texto normal, 3:1 texto grande. Las 21 mediciones del
  sistema están en [`BRAND.md`](BRAND.md).
- **Objetivo táctil**: `min-h-11` (44 px) en superficie pública. El estudio tiene
  su propia regla en `globals.css` bajo `@media (pointer: coarse)`, para no pagar
  el tamaño con oclusión de lienzo en escritorio.
- **Foco visible siempre**: `focusRing` de `styles.ts`. `focus-visible` y no
  `focus` — quien usa ratón no quiere ver el anillo; quien usa teclado no puede
  trabajar sin él.
- **Ocultar sin desaparecer**: `sr-only`, nunca `display:none`, para nada que
  deba seguir siendo alcanzable con teclado (el enlace de salto) o legible por
  una prueba (la telemetría de diagnóstico del estudio).

### 8 bis · El contrato de accesibilidad de cada primitiva

La tabla de arriba dice para qué sirve cada primitiva. Ésta dice **qué promete**:
qué rol expone, qué teclas maneja y qué anuncia. Lo nuevo nace cumpliendo esto o
no entra.

Está fijado por dos redes distintas, y la separación importa: lo que se puede
leer del HTML lo comprueba `src/components/ui/primitives-contract.spec.ts`
(marcado estático, milisegundos); lo que exige un navegador vivo —trampa de
foco, flechas entre pestañas, Escape— lo comprueba
`e2e/a11y/teclado-embudo.spec.ts`. Ninguna de las dos finge lo que la otra sabe.

| Primitiva | Rol expuesto | Teclas | Qué anuncia |
| --- | --- | --- | --- |
| `Button` | `button` con `type="button"` explícito | Enter / Espacio (nativo) | La etiqueta; `aria-busy` mientras `loading`, **conservando** el texto |
| `Input` / `Textarea` / `Select` | el nativo, con `<label for>` | las nativas | La etiqueta; el error por `aria-describedby` y `aria-invalid` |
| `PasswordField` | `button` con `aria-pressed` para mostrar/ocultar | Enter / Espacio | Si la contraseña está visible; la entropía **informa, no bloquea** |
| `Checkbox` | `checkbox` | Espacio | «Se aplicará al enviar» |
| `Switch` | `switch` | Espacio | «Ya está aplicado» — por eso el rol es distinto |
| `Tabs` | `tablist` con `aria-label`, hijos `tab` | ← → cambian de pestaña, Inicio/Fin a los extremos, **Tab SALE** de la lista | `aria-selected` en la activa; las inactivas con `tabindex="-1"` |
| `Modal` | `dialog` + `aria-modal` + `aria-label` | Escape cierra; Tab circula **dentro** | El título; el foco entra al primer control y **vuelve al abridor** al cerrar |
| `ProgressBar` | `progressbar` | — | `aria-valuenow/min/max`: sin ellos es una caja de color |
| `Skeleton` | `aria-hidden` | — | **Nada.** Es decoración; leerlo anuncia cajas vacías |
| `Tooltip` | descriptivo, CSS puro | se muestra con `focus-within` | El texto, también a quien llega por teclado |
| `EmptyState` | `region` con su encabezado | — | El estado y **la salida**: uno sin `action` es un callejón |
| `ErrorBoundary` | `alert` | — | La zona que se cayó, y que el resto sigue vivo |
| `CadDialogShell` | `dialog` + `aria-modal` + `aria-labelledby` | Escape cierra (fase de captura, para no cancelar además el comando en curso) | El título del cuadro |

**Lo que estas primitivas NO prometen, dicho aquí para que nadie lo suponga:**
`CadDialogShell` **no** atrapa el foco ni lo devuelve al cerrar. Hacerlo a medias
—mover el foco a un sitio equivocado— deja a quien navega con teclado peor que
antes, así que queda como trabajo con nombre en
[`DEUDA-MONOLITO.md`](../execution/DEUDA-MONOLITO.md) y no como una casilla
marcada de más. `Modal` sí lo hace, y es la primitiva que hay que usar cuando el
diálogo es del producto y no del lienzo.

---

## 9. Cómo se añade algo al sistema

1. **¿Existe ya un token?** Casi siempre sí. Gana el token.
2. **¿No existe?** Se añade a `globals.css` —con el porqué escrito al lado— y se
   consume desde ahí. Nunca un valor suelto en un componente.
3. **¿Es un color de estado que va a ser TEXTO?** Necesita su variante `-ink`, y
   la variante se calcula midiendo, no a ojo.
4. **¿Es una primitiva nueva?** Va a `components/ui/`, se exporta por la barrica
   y se añade a la lista del gate.

---

## 10. Comandos

```bash
npx tsx apps/web/src/components/ui/design-system.spec.ts
```

```bash
node scripts/brand/build-brand-assets.mjs --check
```

```bash
npm run capture:product --workspace=web -- --start
```

En Windows, Playwright necesita `PLAYWRIGHT_BROWSERS_PATH` apuntando a la caché
del disco donde están los navegadores; sin esa variable ninguna captura ni
ningún golden arranca.
