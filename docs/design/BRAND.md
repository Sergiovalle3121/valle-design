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
conversión de esos tokens HSL, no una segunda paleta. Las cifras de contraste
están medidas con la fórmula de luminancia relativa de WCAG 2.1 y el umbral es
**4,5:1 para texto normal y 3:1 para texto grande**.

### Superficies y texto

| Token                        | Claro     | Oscuro    | Sobre `background` | Sobre `card` | Veredicto |
| ---------------------------- | --------- | --------- | ------------------ | ------------ | --------- |
| `--foreground`               | `#172036` | `#f3f5f7` | 14,86:1 / 17,43:1  | 16,20:1 / 16,41:1 | **AA / AAA** |
| `--muted-foreground`         | `#5c6370` | `#a2aab9` | 5,55:1 / 8,15:1    | 6,05:1 / 7,67:1   | **AA** |
| `--background`               | `#f4f5f8` | `#0c1017` | —                  | —            | superficie |
| `--card` / `--surface`       | `#ffffff` | `#131720` | —                  | —            | superficie |
| `--border`                   | `#dfe2e7` | `#2f3541` | —                  | —            | hairline |

### Marca

| Token                     | Valor     | Con texto blanco | Veredicto |
| ------------------------- | --------- | ---------------- | --------- |
| `--brand-primary`         | `#6366f1` | 4,41:1           | **sólo texto grande** — no usar como relleno de botón |
| `--brand-primary-strong`  | `#4f46e5` | **6,29:1**       | **AA** — el relleno de la acción primaria |
| `--brand-primary-hover`   | claro `#4338ca` | **7,90:1**  | **AA** |
| `--brand-primary-hover`   | oscuro `#5b54ea` | **5,38:1** | **AA** |
| `--primary` (oscuro)      | `#5052e2` | 5,76:1           | **AA** |

`--brand-primary` es el acento de la identidad; `--brand-primary-strong` es la
variante que **cumple AA con texto blanco pequeño encima**. La diferencia entre
4,41 y 4,5 es la diferencia entre pasar y no pasar, y por eso el token existe:
para que la corrección se pida por nombre y no se resuelva a ojo en cada botón.

### Estados: relleno y tinta son DOS tokens

Es la trampa más común del contraste, y este sistema la evita por construcción:

| Estado    | Relleno (`--x`) claro | Como texto sobre `card` | Tinta (`--x-ink`) claro | Como texto |
| --------- | --------------------- | ----------------------- | ----------------------- | ---------- |
| success   | `#0fa976`             | 3,02:1 ❌ **falla AA**   | `#0b7a55`               | **4,52:1 AA** |
| warning   | `#f59f0a`             | 2,13:1 ❌ **falla AA**   | `#935f06`               | **4,58:1 AA** |
| danger    | `#ef4343`             | 3,78:1 ❌ **falla AA**   | `#d31212`               | **4,59:1 AA** |
| primary   | `#6366f1`             | 4,41:1 ❌ **falla AA**   | `#4f46e5`               | **6,29:1 AA** |

En **oscuro** los rellenos ya pasan como texto (7,37 · 9,00 · 5,45) y la tinta
coincide con ellos; la excepción es el índigo, que sobre la tarjeta oscura da
3,11:1 y por eso su tinta se aclara a `hsl(239 72% 68%)` — **4,64:1**.

> **La regla:** `bg-success` para rellenar, `text-success-ink` para escribir.
> Reutilizar el color del relleno como color de letra «porque es el mismo
> estado» es la forma más común de fallar accesibilidad sin enterarse.

### Los colores ACI NO son marca

`#ff0000`, `#00ff00`, `#0000ff`, `#00ffff`, `#ffff00`, `#ff00ff` y compañía son
**datos del plano**: el índice de color de AutoCAD que el usuario asigna a una
capa y que decide cómo se traza esa capa en el papel. No se tocan, no se
armonizan con la paleta y no se sustituyen por tokens. Cambiarlos sería cambiar
el dibujo del cliente.

---

## 3. Tipografía

| Familia            | Rol                                                    | Variable CSS         |
| ------------------ | ------------------------------------------------------ | -------------------- |
| **Inter**          | Todo el texto de interfaz y de contenido               | `--font-inter` → `--font-sans` |
| **JetBrains Mono** | Cifras, coordenadas, comandos, códigos y tokens        | `--font-jetbrains` → `--font-mono` |

Las carga `next/font/google` desde nuestro propio origen —sin petición a
terceros en tiempo de ejecución— con `display: swap` y subconjunto `latin`, que
es el que trae acentos, ñ y los signos de apertura que el español necesita.

**La mono no es decorativa.** `.type-mono` fuerza `tnum` (cifras de ancho fijo) y
`zero` (cero ranurado). En una coordenada cotada, distinguir un 0 de una O no es
un detalle de estilo; y sin `tnum`, un contador que pasa de 9 a 10 empuja media
línea de interfaz.

La escala completa —siete escalones y un piso duro de 11 px— está en
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

---

## 4. Tono de voz

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
- **Competencia nombrada, afiliación negada.** Nombrar a AutoCAD para
  posicionarse es legítimo; dejar que alguien deduzca una afiliación que no
  existe, no. El aviso de marcas va en el pie, visible en todas las secciones.

---

## 5. Las dos excepciones a «ningún hex fuera de globals.css»

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
