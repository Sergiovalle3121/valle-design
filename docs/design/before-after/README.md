# Antes y después

Dos campañas viven en esta carpeta. El sufijo del archivo dice cuál:

| Campaña | Sufijo | Base del «antes» |
| ------- | ------ | ---------------- |
| **Firma propia** (2026-08-28) — identidad ultra premium, cuenta segura, voz del usuario | `-firma-antes` / `-firma-despues` | `a7a33d8` |
| Diseño (2026-08-21) — el sistema | `-antes` / `-despues` | `7982cf3` |

---

## Campaña de firma propia — 2026-08-28

**Qué mirar, en este orden:**

1. **`portada-fold-{dark,light}-firma-{antes,despues}.png`.** El sustrato pasa de
   un azul-gris frío a **grafito cálido**, y el acento de índigo genérico a
   **violeta eléctrico**. El titular estrena display propia (Space Grotesk) y
   gana un escalón de tamaño. La entradilla del «antes» dice «Una alternativa a
   AutoCAD en la nube»; en el «después» no hay comparación con nadie.
2. **El visor del hero.** Antes: una captura del editor. Después: **una lámina
   que se dibuja sola** —numeración `A-01`, cajetín, cotas con marca oblicua—.
   El producto contado por lo que hace, y las capturas reales del editor siguen
   justo debajo en la página completa.
3. **`registro-{dark,light}-firma-{antes,despues}.png`.** De un formulario
   centrado a **pantalla partida** con el plano trazándose y los sellos de
   confianza, y el campo de contraseña con mostrar/ocultar y medidor de
   entropía.
4. **`portada-{dark,light}-firma-despues.png`** (completa) trae el centro de
   preguntas: de 7 a 36 respuestas en 6 categorías.
5. **El detalle que delata la ola 3:** en `portada-fold-dark-firma-antes.png`,
   el panel derecho del editor enseña dieciocho filas de
   `cad_mt60y4ol_uzfo`. Ése era el estado real del producto, y es lo que la ola
   3 sustituyó por «Muro 1 · Muro 2 · Texto 5».

```bash
# «después», contra el árbol de la campaña
npx tsx apps/web/scripts/capture-public-shots.mts docs/design/before-after firma-despues
npx tsx apps/web/scripts/capture-funnel-shots.mts docs/design/before-after firma-despues
# «antes», con LOS MISMOS scripts corriendo en un worktree en `a7a33d8`
```

---

## Campaña de diseño — 2026-08-21

La prueba de la campaña, y material de venta.

**Todas las capturas son reproducibles**, no recortes a mano. El «después» sale
de los scripts que quedaron versionados; el «antes» se tomó con **esos mismos
scripts corriendo contra un árbol de trabajo en el commit `7982cf3`**, el último
anterior a la campaña. Es decir: misma resolución, mismo tema, mismo plano
dibujado con los mismos comandos, mismo encuadre. Lo único que cambia entre las
dos columnas es el producto.

```bash
npx tsx scripts/capture-public-shots.mts <destino> <etiqueta>
npx tsx scripts/capture-funnel-shots.mts <destino> <etiqueta>
npx tsx scripts/capture-product-shots.mts
```

Los tres a 1440×900 con `deviceScaleFactor: 2` y `reducedMotion: "reduce"`.
En Windows hace falta `PLAYWRIGHT_BROWSERS_PATH`.

---

## Las pantallas

| Pantalla | Antes | Después |
| -------- | ----- | ------- |
| **Portada** (primer pliegue) | `portada-fold-{dark,light}-antes.png` | `portada-fold-{dark,light}-despues.png` |
| **Portada** (completa) | `portada-{dark,light}-antes.png` | `portada-{dark,light}-despues.png` |
| **Registro** | `registro-{dark,light}-antes.png` | `registro-{dark,light}-despues.png` |
| **Tablero vacío** | `tablero-vacio-{dark,light}-antes.png` | `tablero-vacio-{dark,light}-despues.png` |
| **Estudio** | `estudio-{dark,light}-antes.png` | `estudio-{dark,light}-despues.png` |
| **Precios** | `precios-{dark,light}-antes.png` | `precios-{dark,light}-despues.png` |
| **Espacio papel** (la lámina) | `espacio-papel-antes.png` | `espacio-papel-despues.png` |
| **Verificación de correo** | `verificacion-{dark,light}-antes.png` | `verificacion-{dark,light}-despues.png` |
| **404** | `404-{dark,light}-antes.png` | `404-{dark,light}-despues.png` |
| **Gestor de capas** | `paleta-capas-antes.png` | (en `public/product/paleta-capas.png`) |

---

## Qué mirar en cada par

**Portada.** Antes: un muro de tarjetas de texto, y en el hero una caja con
degradado y una lista `<ol>` numerada — un programa de dibujo anunciándose sin
enseñar un dibujo. Después: el producto ES la imagen. Y la tipografía: antes
salía con la fuente del sistema (distinta en cada equipo), ahora con Inter.

**Estudio, tema claro.** El par más elocuente de todos. Antes: el lienzo se
aclaraba y **las paletas seguían negras** — catorce de veinte no tenían una sola
variante `dark:`. El estudio quedaba en dos productos pegados por la mitad.

**Estudio, barra superior.** Antes lo más fuerte de la pantalla era un botón
ROJO que decía «Cerrar», y al lado «0 estaciones · 0 equipos». La barra de
estado publicaba «Tool: select · Native 7 · Viewport 7/7 · U7/R0».

**Estudio, paleta de herramientas.** Antes: dieciocho etiquetas de texto a
10,5 px. Después: icono, etiqueta y un tooltip que enseña el atajo de teclado.

**Tablero vacío.** Antes: dos formularios con seis campos y, debajo, una caja
punteada con una frase gris. Después: tres caminos, y el primero abre un plano
terminado en cinco segundos.

**404.** Antes: la pantalla por defecto de Next — la marca del framework, en
inglés, en el navegador de un cliente mexicano.

**Precios.** Antes: `sm:grid-cols-2` y ningún plan destacado. Después: jerarquía,
plan recomendado y el sello fiscal (IVA incluido · factura CFDI) donde se ve.

---

## Nota sobre el estudio

Las capturas del estudio siguen diciendo **«AXOS-CAD-STUDIO»** y conservan las
herramientas «Aisle», «Zone» y «Equipment». No es un descuido de esta campaña:
es vocabulario del producto industrial del que salió este editor, y lo está
retirando la **campaña de identidad** que corrió en paralelo
(`docs/execution/CAMPANA_IDENTIDAD_20260822.md`). Cuando termine, las capturas se
regeneran con un comando — para eso son un script y no un recorte.
