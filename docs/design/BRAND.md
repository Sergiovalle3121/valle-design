# Marca — Valle Design

> El sistema de diseño está en [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). Este
> documento cubre lo que identifica al producto: el logotipo, la paleta con sus
> contrastes medidos, la tipografía y el tono de voz.

---

## 1. El isotipo

![Isotipo](../../apps/web/public/brand/isotipo-claro.svg)

Tres elementos, ninguno decorativo:

| Elemento                          | Qué es                                                     | Por qué está |
| --------------------------------- | ---------------------------------------------------------- | ------------ |
| **Línea de cota** con marcas a 45° | El remate de cota del dibujo arquitectónico                 | En México y casi toda Europa la cota se remata con marca oblicua, no con flecha. Un arquitecto reconoce el gesto antes de leer el nombre. Esa misma horizontal es el riel superior de un cajetín. |
| **La V**                           | Inicial de Valle · perfil de un valle · ángulo de escuadra  | Una sola forma que cumple tres lecturas y ninguna forzada. |
| **Nodo cuadrado**                  | El marcador de punto final de la referencia a objetos       | Es lo que todo CAD pinta cuando el cursor engancha. Ancla la marca al oficio, no a la moda. |

**Una sola fuente de verdad.** La geometría vive en
`apps/web/src/components/brand/logo-geometry.ts` y de ahí salen: el componente
`<Logo/>`, los siete SVG de `apps/web/public/brand/`, `icon.tsx`,
`apple-icon.tsx`, `favicon.ico` y la tarjeta social. El gate
`node scripts/brand/build-brand-assets.mjs --check` falla si un archivo se
desincroniza — el logotipo no puede quedarse en una versión anterior de sí mismo.

```bash
node scripts/brand/build-brand-assets.mjs
```

### Archivos

| Archivo                            | Uso                                         |
| ---------------------------------- | ------------------------------------------- |
| `isotipo-claro.svg`                | Marca sola, sobre fondo claro               |
| `isotipo-oscuro.svg`               | Marca sola, sobre fondo oscuro              |
| `isotipo-mono.svg`                 | `currentColor`: hereda el color del contexto |
| `lockup-claro.svg` / `-oscuro.svg` | Marca + nombre, horizontal                  |
| `wordmark-claro.svg` / `-oscuro.svg` | Sólo el nombre                            |

**Dentro del producto se usa el componente, no el archivo.** `<Logo/>` compone
el nombre con la tipografía real que ya carga `next/font` y pinta el isotipo con
`currentColor`, así que funciona en claro, en oscuro, sobre un botón y en
monocromo sin variantes. Los `.svg` existen para donde sólo cabe una imagen:
correo, README, la tarjeta de un tercero.

### Reglas de uso

**Tamaño mínimo**

- Isotipo: **16 px**. Por debajo la línea de cota se cierra y el nodo se come la V.
- Lockup: **96 px de ancho**.

**Espacio libre**

Un margen igual a la **altura del nodo** (6,5 unidades de la rejilla de 32, ≈ 20%
del alto de la marca) en los cuatro lados. Nada entra en ese margen: ni texto, ni
borde, ni otra marca.

**Qué NO hacer**

- No cambiar las proporciones: el isotipo se escala uniforme o no se escala.
- No rotarlo. La línea de cota es horizontal porque una cota es horizontal.
- No recolorear la V ni la cota fuera de la tinta del tema. El nodo es lo único
  que puede llevar el acento.
- No añadir sombra, contorno ni degradado.
- No pintarlo sobre una fotografía ni sobre un fondo con textura.
- No sustituirlo por un icono de librería. Ése era el problema anterior: cuatro
  `<DraftingCompass/>` de lucide en cuatro archivos, un icono genérico que usan
  miles de productos.
- No rehacer el lockup a mano. Es `<Logo/>` o es un archivo generado.

---

## 2. Paleta, con los contrastes medidos

Todo color sale de `apps/web/src/app/globals.css`; los hex de esta tabla son la
conversión de esos tokens HSL, no una segunda paleta. Las cifras están **medidas
por un gate** —`npm run check:contrast`, 70 pares en los dos temas— con la
fórmula de luminancia relativa de WCAG 2.1. El umbral es **4,5:1 para texto
normal**, 3:1 para elementos gráficos y 1,3:1 para el relieve de un borde.

### La decisión de fondo: grafito cálido, y el oscuro por defecto

La paleta anterior era un claro de banca con un oscuro que era su *inverso
fiel*: coherente, correcto y anónimo. La v2 elige una **temperatura** —cálida
abajo, fría en el acento— y la sostiene en los dos modos, que es lo que hace
que un producto se reconozca sin leer el nombre.

Y el **oscuro pasa a ser el modo por defecto**. No por moda: es el sustrato del
oficio. Un dibujante mira geometría fina sobre fondo oscuro porque así la línea
brilla en vez de recortarse, y porque una pantalla de trabajo de ocho horas en
blanco cansa. `system` sigue existiendo, pero ahora se pide.

| Token                | Claro     | Oscuro (por defecto) | Qué es |
| -------------------- | --------- | -------------------- | ------ |
| `--background`       | `#f7f5f2` | `#0c0b0b`            | El papel / la mesa de noche |
| `--card` / `--surface` | `#ffffff` | `#1f1d1c`          | La lámina levantada |
| `--muted`            | `#f0eeea` | `#312e2b`            | Relleno tenue |
| `--border`           | `#dcd7d0` | `#413d3a`            | Hairline |
| `--foreground`       | `#251f18` | `#f7f5f3`            | Texto principal |
| `--muted-foreground` | `#696159` | `#c2bdb7`            | Texto secundario |

**Siete puntos de relieve, no tres.** En oscuro el fondo baja a 4,5 % de luz y
la tarjeta sube a 11,5 %. La v1 los tenía a tres puntos de distancia y las
tarjetas se fundían con la página; siete puntos —más un `inset` de luz en el
canto superior de la sombra— es lo que de verdad separa planos sobre casi-negro,
donde ninguna sombra proyectada se ve.

### El acento: violeta eléctrico

| Token                     | Claro     | Oscuro    | Medido |
| ------------------------- | --------- | --------- | ------ |
| `--valle-accent`          | `#6b4def` | `#6b4def` | el acento de identidad |
| `--brand-primary-strong`  | `#5637e1` | `#5637e1` | relleno del botón primario · **6,93:1** con su letra |
| `--brand-primary-hover`   | `#3e1bda` | `#7457f4` | **8,85:1** claro · **5,15:1** oscuro |
| `--primary`               | `#6b4def` | `#8c73fc` | trazo y herramienta activa |
| `--primary-ink`           | `#4d2cdd` | `#9d87fd` | **texto** de marca · 7,72:1 / 5,85:1 |

**El límite legal, escrito donde se toma la decisión.** Inspirarse en las
convenciones del CAD profesional —fondo oscuro de trabajo, densidad, precisión—
está bien y es el oficio. Imitar la imagen comercial de otro fabricante no: ni
su color corporativo, ni su tipografía de marca, ni composiciones que evoquen su
identidad, ni su nombre en el branding. Por eso el acento de Valle es violeta y
nunca rojo, y por eso la display es Space Grotesk y no una grotesca industrial
de catálogo ajeno.

### Estados: relleno y tinta son DOS tokens

Es la trampa más común del contraste y el sistema la evita por construcción.

| Estado  | Relleno claro | Tinta clara | Tinta como texto | Relleno oscuro | Tinta oscura |
| ------- | ------------- | ----------- | ---------------: | -------------- | ------------ |
| success | `#0c7946`     | `#09673b`   | **6,97:1**       | `#31d88a`      | `#4bdd99`    |
| warning | `#d07506`     | `#914d08`   | **6,42:1**       | `#fbb337`      | `#fcbe55`    |
| danger  | `#cc1e24`     | `#b11b20`   | **6,89:1**       | `#dd2c32`      | `#f78286`    |
| primary | `#6b4def`     | `#4d2cdd`   | **7,72:1**       | `#8c73fc`      | `#9d87fd`    |

> **La regla:** `bg-success` para rellenar, `text-success-ink` para escribir.
> Reutilizar el color del relleno como color de letra «porque es el mismo
> estado» es la forma más común de fallar accesibilidad sin enterarse.

### El gate, y por qué existe

`npm run check:contrast` mide 35 pares por tema y falla la corrida entera si uno
baja del umbral. Se escribió ANTES de cortar la paleta v2 —construir la regla y
después cortar— y encontró dos fallos en el primer corte: un borde claro con
1,23:1 de relieve y el violeta de hover con 4,21:1 sobre blanco. Sin el gate, los
dos habrían llegado a producción con la campaña puesta.

### Los colores ACI NO son marca

`#ff0000`, `#00ff00`, `#0000ff` y compañía son **datos del plano**: el índice de
color que el usuario asigna a una capa y que decide cómo se traza esa capa en el
papel. No se tocan, no se armonizan con la paleta y no se sustituyen por tokens.
Cambiarlos sería cambiar el dibujo del cliente.

---

## 3. Tipografía

| Familia             | Rol                                                | Variable CSS |
| ------------------- | -------------------------------------------------- | ------------ |
| **Space Grotesk**   | Display, títulos y encabezados                     | `--font-space-grotesk` → `--font-display` |
| **Inter**           | Texto de interfaz y de contenido                   | `--font-inter` → `--font-sans` |
| **JetBrains Mono**  | Cifras, coordenadas, comandos, códigos y tokens    | `--font-jetbrains` → `--font-mono` |

**Por qué una display propia.** Con una sola familia para todo, un título es
texto grande y nada más: correcto y sin carácter. Space Grotesk tiene la
personalidad justa —terminaciones rectas, una `g` de una sola planta, ancho
técnico— para que un encabezado se lea como un rótulo de plano y no como el
mismo párrafo en 48 px. Se autohospeda igual que las otras dos (OFL 1.1, ver
`THIRD_PARTY_NOTICES.md`): ni una petición a un tercero en tiempo de ejecución.

**La mono no es decorativa.** `.type-mono` fuerza `tnum` (cifras de ancho fijo) y
`zero` (cero ranurado). En una coordenada cotada, distinguir un 0 de una O no es
un detalle de estilo; y sin `tnum`, un contador que pasa de 9 a 10 empuja media
línea de interfaz.

**`.type-sheet-number`** es el escalón nuevo de esta campaña: el número de
lámina —`01`, `02`— que numera las secciones. Es tipografía como detalle de
oficio, no ornamento.

La escala completa está en [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

---

## 4. Movimiento y textura: la firma

Un producto se reconoce por cómo se mueve tanto como por cómo se ve.

| Recurso | Token / utilidad | Qué dice |
| ------- | ---------------- | -------- |
| **El trazo que se dibuja solo** | `.stroke-draw`, `.stroke-draw-loop`, `--ease-draw` | La firma de movimiento. Una planta que se traza sola con `stroke-dashoffset`: es lo que hace el producto, contado por el producto. |
| **Retícula de plano** | `.blueprint-grid`, `--grid-fine`, `--grid-major` | La textura del sustrato. Ocho y sesenta y cuatro píxeles, como una cuadrícula de papel milimétrico. |
| **Marcas de esquina y líneas de construcción** | `.corner-marks`, `.construction-line` | El motivo gráfico. Las marcas de registro de una lámina. |
| **Curvas y duraciones** | `--duration-instant` … `--duration-draw`, `.motion-fast`, `.motion-confirm` | Cinco escalones nombrados. Un control responde en `fast`; una confirmación usa la curva de `confirm`, que rebota una vez y para. |

**Todo respeta `prefers-reduced-motion`, y respetarlo no es apagarlo.** Un trazo
animado que simplemente deja de animarse desaparecería —`stroke-dashoffset` se
queda en su valor inicial y el dibujo no se ve—. La regla del sistema fuerza
`stroke-dashoffset: 0` y `opacity: 1`: sin movimiento, el dibujo **completo**.

---

## 5. Tono de voz

Español **es-MX**. Sin emojis en la interfaz — hoy hay cero y se conserva.

**Se dice lo que el producto hace, con su límite al lado.** La portada tiene una
sección entera titulada «Lo que todavía no hacemos» y no es humildad: en CAD el
comprador prueba antes de firmar, y una promesa que el editor no cumple se
descubre en la primera sesión, cuando ya costó la confianza. Esa sección es un
activo y no se toca.

| Se escribe así                                     | No así                                    |
| -------------------------------------------------- | ----------------------------------------- |
| «No abrimos ni escribimos DWG.»                     | «Compatibilidad con los formatos líderes.» |
| «La cota queda amarrada a la geometría que mide.»   | «Acotación inteligente de última generación.» |
| «Tarda hasta un par de minutos: el envío se encola.» | «¡Tu correo va en camino!»                 |
| «Enviamos un enlace a sergio@ejemplo.mx.»           | «Revisa tu bandeja de entrada.»            |

- **Nombra el dato concreto.** El correo exacto, el número de entidades, el
  tamaño máximo. Un mensaje que no nombra el dato obliga al usuario a adivinar.
- **Sin signos de admiración.** El producto es una herramienta de trabajo.
- **Sin superlativos ni «revolucionario», «potente», «intuitivo».** Si hay que
  decir que algo es intuitivo, no lo es.
- **Nunca claims sin respaldo.** Cada capacidad anunciada tiene módulo, spec y —en
  la mayoría— golden en el repositorio.

### El producto se describe solo

**Ninguna superficie pública se posiciona por comparación.** La portada decía
«una alternativa a…» y se retiró: definirse contra otro le regala el marco al
otro, y el comprador se queda con el nombre grande. Donde hace falta hablar de
intercambio se habla del **formato** —«DXF en la versión AC1015», «el formato
estándar de intercambio que cualquier programa de dibujo abre»—, que además es
lo cierto.

Lo que se conserva, porque es legalmente conveniente y honesto: **una línea de
marcas en el pie**, en `components/marketing/TrademarkNotice.tsx`. Y lo que vive
en guías y preguntas frecuentes, no en marketing: «si vienes de otro CAD, tu
memoria muscular funciona».

El gate `npm run check:surface` revisa 19 zonas públicas, quita los comentarios
antes de mirar —juzga lo que el usuario lee, no lo que el equipo escribe para
entenderse— y comprueba las dos mitades: que no aparezcan marcas ajenas fuera
del módulo autorizado **y** que el aviso siga montado. Un gate que sólo
prohibiera se satisface borrando el aviso legal.

---

## 6. Las dos excepciones a «ningún hex fuera de globals.css»

La regla de oro del sistema es que ningún componente escribe un color. Hay
exactamente dos excepciones, y las dos son de frontera técnica, no de gusto:

1. **`logo-geometry.ts` → `BRAND_INK`.** Un `.svg` servido como imagen se pinta
   en su propio documento aislado y no ve las variables CSS de la página. Por eso
   los archivos estáticos llevan la tinta resuelta y hay uno por tema. Los
   valores son los tokens ya convertidos, no una paleta paralela.

2. **`social-card.tsx`, `icon.tsx`, `apple-icon.tsx`.** `ImageResponse` renderiza
   fuera de la página, sin hoja de estilos: todo va en estilos en línea. Los
   colores salen de `BRAND_INK`, es decir de la misma excepción anterior.

El gate `src/components/ui/design-system.spec.ts` conoce esas tres rutas y
rechaza cualquier hex en cualquier otro archivo de la capa visual.
