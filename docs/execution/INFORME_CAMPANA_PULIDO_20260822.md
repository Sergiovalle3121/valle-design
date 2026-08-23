# Informe — Campaña autónoma de pulido

**Fecha:** 22–23 de agosto de 2026 · **Base de arranque:** `fc9ba23` ·
**Bitácora completa:** [`CAMPANA_PULIDO_20260822.md`](CAMPANA_PULIDO_20260822.md)

La cola pedía cerrar la deuda de las tres campañas anteriores «para que no quede
una sola pieza del producto de la que haya que dar explicaciones al enseñarlo».
Este informe dice qué se cerró, qué no, y con qué números.

---

## 1. Lo que se cerró

### OLA 0 — la portada dice la verdad

Las seis capturas de `public/product/` se habían tomado horas ANTES de que la
campaña de identidad purgara el vocabulario del planificador de plantas, y eran
exactamente las que la portada enseñaba. Se regeneraron, y al mirarlas una por
una aparecieron cuatro defectos más de los denunciados:

| Captura | Enseñaba | Enseña |
| --- | --- | --- |
| `estudio-dark` / `-light` | «AXOS-CAD-STUDIO» de título, herramientas `Aisle`/`Zone`/`Equipment`, el globo de Colaboración encima del panel de propiedades, la línea de comandos pisando la barra de estado, y un dibujo de 4 muros + 2 cotas | «Casa Zaragoza · Planta baja», `Corridor`/`Area`/`Symbols`, nada superpuesto, y una planta de **18 entidades**: 6 muros que resuelven sus esquinas, puerta con barrido, 3 ventanas alojadas, sombreado asociativo, 3 rótulos y 3 cotas |
| `paleta-propiedades` | la línea de comandos con «La paleta de propiedades no está montada en este espacio de trabajo» **en rojo** | la paleta abierta con Ctrl+1 y una entidad designada |
| `espacio-papel` | el espacio MODELO con el menú de `LAYOUT` abierto | la lámina A1 de verdad, con muros hachurados, huecos, rótulos, cotas y cajetín |

Y un guardián nuevo lee el texto RENDERIZADO antes de cada disparo: si el
vocabulario del producto muerto vuelve, no hay foto. Importa la lista del gate
de identidad en vez de copiarla, así que crece con él.

### OLA 1 — los seis goldens heredados, cerrados

De **81/87 a 85/87**. Cuatro causas, y cuatro defectos de PRODUCTO arreglados —
ninguno se cerró relajando una aserción:

1. **La capa de comentarios nunca recibió un clic.** `setPlacing` concatenaba
   `pointer-events-auto` sobre una base que ya llevaba `pointer-events-none`; en
   el atributo `class` el orden no decide, decide la hoja de Tailwind, y ahí gana
   `none`. Anclar un comentario sobre el plano **no funcionó jamás**, y ninguna
   aserción de dominio podía verlo.
2. **El muelle de colaboración se comía las pestañas de la biblioteca.** El
   golden 21 llevaba meses en rojo con el mensaje exacto escrito en el log y
   nadie lo había leído.
3. **El encabezado de la consola LISP mezclaba dos poblaciones** —rutinas del
   estudio y comandos totales, con los de fábrica dentro— contradiciendo a su
   propia lista.
4. **La holgura de la barra de estado subía la columna entera**, y con ella los
   botones del acompañante de los primeros cinco minutos, que aterrizaban sobre
   el plano.

Tres aserciones de esquema se actualizaron contra `CAD_DOCUMENT_SCHEMA` en vez
de contra un número, con la evidencia de que las subidas fueron deliberadas,
documentadas y aditivas.

### OLA 2 — el ERP fuera de la suite

`e2e/fixtures/mock-backend.ts` era un ERP/MES completo en miniatura: 30 rutas
—órdenes de trabajo con takt objetivo, surtido a línea PENDING/STAGED/SHORTAGE,
reabasto, terminal de operador con andon, no conformidades, inventario—. Era el
pendiente número uno de la campaña de identidad y sobrevivió a ella porque 61
specs lo importan.

El cruce salió inequívoco y se puede repetir: **ninguna de las 30 rutas aparece
en ninguna spec, ni en el código de producto**. Las 61 importan un solo símbolo.
**739 → 85 líneas.** Lo que quedaba hacía tres cosas: interceptar el origen
entero, aplicar la comprobación de identidad real, y contestar vacío pero con
éxito.

### OLA 3 — las cotas dibujan lo que prometen

DIMSTYLE tenía el núcleo de ~30 DIMVARs y le faltaba el último tramo: la ENTIDAD
no llevaba encima lo que el render necesita leer, así que **el plano salía igual
con cualquier norma de acotación**. Esquema 10, siete campos opcionales-ausentes:
DIMTXT, DIMTXSTY, DIMCLRT, DIMCLRD, DIMCLRE, DIMTAD y DIMJUST. Se hornean, llegan
al render —la altura del rótulo dejó de derivarse de `arrowSize × 0,55`— y viajan
por DXF con ida y vuelta.

### Defecto grave encontrado de paso: los muros no se imprimían

Fotografiando la lámina para la portada salió que el sombreado, los rótulos y las
cotas aparecían en la hoja **y la casa no**. `renderEntity()` de `paper-space.ts`
es una escalera de ramas escrita cuando el documento iba por el esquema 3, y todo
lo demás caía en un `return []` silencioso. El compilador lo confirma sin lugar a
dudas: en ese punto el tipo estrechado era `CadSchema4Entity | CadSchema5Entity |
CadWallEntity | CadOpeningEntity` — **doce tipos**, incluidas las dos entidades
BIM que son la bandera del producto, desaparecían del PDF sin una advertencia.

### El cajetín y el embudo en el teléfono

- «Flujo total» imprimía «---» en cada lámina publicada: `flowLen` no tenía un
  solo productor. Fuera. Los contadores del planificador de plantas se emiten
  sólo cuando tienen algo que contar.
- **No había forma de iniciar sesión desde un teléfono sin abrir la hamburguesa.**
- **La portada se desplazaba en horizontal en móvil**: `scrollWidth` 560 contra
  390. Una sola causa: el halo del marco del producto, `absolute -inset-8`, que
  nadie recortaba. Anterior a esta campaña.

---

## 2. Lo que NO se hizo, y por qué

| Ítem | Estado |
| --- | --- |
| **OLA 4 — rendimiento** (`architecture@100k` en 25,3 s contra meta de 15 s) | **NO EMPEZADA.** Es trabajo de pipeline de render con medición en GPU real, y la campaña se quedó sin margen tras absorber los defectos que fueron apareciendo. Ninguna línea tocada, ninguna cifra movida. |
| **OLA 5.1** — migrar controles a primitivas, bajar los 27 `shadow-2xl` | no hecha |
| **OLA 5.4** — barrido de nombres internos (`station`, `asset`, `flow`) | no hecha |
| **OLA 5.5** — modo presentación | no hecha |
| **OLA 6.1** — golden visual del embudo público | no hecha |
| **OLA 6.2** — gate de contraste automático | no hecha |
| **OLA 6.3** — gate de tono de voz | no hecha |
| **OLA 3.4** — `MLEADERSTYLE`/`TABLESTYLE` por DXF | no hecha |
| **F.3** — recorrido de cliente de punta a punta | **no hecho como paseo manual.** Lo que sí se hizo, y encontró más: correr los barridos que nadie corría. |

**OLA 5.2** (imports muertos) y **R.7** (documentar `check:dwg-evidence`) sí
están cerradas: la primera en la OLA 0, la segunda ya la había hecho la campaña
de cimientos.

---

## 3. Los errores propios, medidos

Esta campaña introdujo tres regresiones y las tres se cazaron midiendo, no
razonando. Van aquí porque el método importa más que el resultado:

1. **Anclar el muelle de colaboración al lienzo** (OLA 0) arregló que tapara el
   panel de propiedades y rompió algo peor: se comía los clics del DIBUJO. Seis
   specs sin relación con la colaboración, quince mensajes nombrando
   `cad-collab-toggle`. Era la lección que el autor original había dejado escrita
   en ese mismo archivo.
2. **Reservar sitio en el panel derecho** (segundo intento) empujó la columna
   99 px hacia abajo y sacó de la vista las filas que el golden 39 edita.
   Confirmado con corrida de control sobre `9835240`: 3 fallos allí, 9 en mi
   árbol.
3. **Subir el envoltorio de la línea de comandos** subía también el acompañante
   de los primeros cinco minutos y la consola LISP, cuyos botones acababan sobre
   el plano. Aislado neutralizando el hook: 14 de 14 en verde.

La salida buena no era elegir a quién tapar: era no tapar. El muelle vive ahora
en la esquina inferior derecha, con spec que deja escrito por qué no vuelve a
ninguno de los dos sitios anteriores.

---

## 4. Cifras antes y después

| Métrica | Antes | Después |
| --- | --- | --- |
| Goldens Playwright | 81/87 | **85/87** |
| `e2e/public` | 0/6 (sin correr desde el rediseño) | **6/6** |
| Specs unitarios (web) | 381/381 | **387/387** |
| Fixture ERP en la suite | 739 líneas | **85** |
| Tipos de entidad que llegan al PDF | 15 de 27 | **27 de 27** |
| Entidades del plano de la portada | 6 | **18** |
| Esquema del documento | 9 | **10** |
| Desbordamiento horizontal en móvil | 560 px contra 390 | **390 = 390** |
| Trinquete de lint | 549 (techo) | 545 |
| `Layout3DEditor.tsx` | 20.248 líneas | **20.245** |

Los dos goldens que siguen rojos —`46-cad-pointer-engine` en los dos navegadores
y `20-cad-multiple-viewports` en firefox— son ANTERIORES a esta campaña,
confirmado con corrida de control sobre `9835240`. El 46 lo bisecó la sesión
paralela: frágil ante el autohospedaje de fuentes, no es defecto de producto.

**Y una advertencia sobre cómo se leen estos números.** El barrido final marcó
7 rojos, no 2. Los otros cuatro —10:156, 15, 16 y 17— eran **ruido de máquina**:
tres fallan con «Guardando…» en vez de «Guardado», es decir, el guardado no
asentó en 15 segundos durante una corrida de 1,1 h con dos trabajadores y un
servidor de desarrollo encima. Reejecutados en aislamiento: **10 de 10 verdes en
3,1 min**. Un barrido largo en un portátil no distingue una regresión de una
espera corta, y la forma de leerlo es reejecutar antes de acusar.

---

## 5. Nota de método que conviene no perder

**Los barridos anteriores corrían sólo `e2e/golden`.** `e2e/public` llevaba sin
medirse desde que se rediseñó la navegación, y escondía tres defectos —uno de
ellos, que la portada se desplaza en un teléfono— que ninguna otra prueba podía
ver. La campaña de cimientos, además, cerró sin correr el barrido de goldens y lo
delegó por escrito: sus 13 commits nunca se habían medido contra la suite e2e
hasta esta campaña.

Un gate que no se corre no es un gate.

---

## 6. Los diez siguientes pasos

1. **OLA 4 entera**: `architecture@100k` tarda 25,3 s contra meta de 15 s, y
   panea a 8,6 fps. El perfil por etapas ya señala teselado y subida de
   geometría.
2. **El texto no se pinta en el LIENZO.** Rótulos MTEXT y etiquetas de cota se
   crean, se guardan y se imprimen en la lámina, pero no aparecen sobre el
   dibujo. Una cota sin número no es una cota. Sin diagnosticar.
3. **Alojar una puerta pierde el encuadre de la cámara.** Probable
   reconstrucción de la escena al cambiar la identidad de `data` en el guardado
   automático (`Layout3DEditor.tsx:6052` depende de `[open, data]`).
4. **`LAYER` y `PROPERTIES` no abren su paleta desde la línea de comandos**: dos
   de los comandos más tecleados de AutoCAD contestan «no está montado en este
   espacio de trabajo».
5. **Los DIMVARs que faltan**: grosores (DIMLWD/DIMLWE), DIMTIH/DIMTOH y los
   bloques de flecha estándar siguen sin gobernar el render.
6. **OLA 6.1/6.2/6.3**: golden visual del embudo, gate de contraste automático
   y gate de tono de voz. Sin ellos, una regresión estética es invisible.
7. **La capa activa de fábrica** ya no es `equipment`, pero sigue siendo
   `layout` y no la que la plantilla considera suya.
8. **OLA 5.1 y 5.5**: primitivas y elevaciones en el monolito, y modo
   presentación.
9. **Correr `e2e/public` y `e2e/real` en cada barrido**, no sólo `e2e/golden`.
10. **Configurar `VALLE_DWG_CORPUS_MIRROR`** en esta máquina, o `check:cad` seguirá
    siendo rojo por entorno y la evidencia DWG committeada, sin vigilancia.
