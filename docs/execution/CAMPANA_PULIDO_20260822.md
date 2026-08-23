# CAMPAÑA AUTÓNOMA DE PULIDO — 22 de agosto de 2026

**HEAD de arranque:** `fc9ba23` (la cola de referencia decía `d5969f0`; la rama
de láminas ya estaba integrada encima al empezar).
**Duración prevista:** 8 horas en cascada, sin detenerse.
**Objetivo:** cerrar la deuda de las tres campañas anteriores y dejar el
producto sin asteriscos.

## Suposiciones de arranque

Las reglas de no-detención prohíben preguntar. Toda decisión conservadora que
haya que tomar se escribe aquí antes de seguir.

- **A-0.** El árbol estaba limpio en `fc9ba23`, dos commits por encima del
  `d5969f0` que cita la cola. Se trabaja sobre `fc9ba23`.

## La cola

### OLA 0 — La portada dice la verdad (~45 min)
- [ ] 0.1 Regenerar capturas con `npm run capture:product -- --start` y
      verificar que ninguna diga «AXOS-CAD-STUDIO», «estaciones», «Aisle»,
      «Zone» ni «Equipment».
- [ ] 0.2 Arreglar en el chrome del estudio: el globo de «Colaboración» se
      encima con el panel de propiedades; la línea de comandos aparece cortada
      por abajo pisando la barra de estado.
- [ ] 0.3 Enriquecer el plano de ejemplo (muros, puertas, ventanas, cotas,
      sombreado, texto) y capturar el espacio papel con el cajetín lleno.
- [ ] 0.4 Comprobación en el script de captura que falle si el texto renderizado
      contiene palabras prohibidas del gate de identidad.

### OLA 1 — Los seis goldens rojos (~2 h)
- [ ] `21-cad-xrefs.spec.ts`
- [ ] `47-cad-lisp-appload.spec.ts`
- [ ] `47-cad-solids.spec.ts`
- [ ] `53-cad-bim-wall.spec.ts`
- [ ] `54-cad-bim-wall-joins.spec.ts`
- [ ] `55-cad-anchored-comments.spec.ts`
- [ ] Barrido completo con el árbol quieto; meta 87/87.

### OLA 2 — Sacar el ERP de la suite (~1.5 h)
- [ ] 2.1 Inventario de qué campo de `e2e/fixtures/mock-backend.ts` consume cada spec.
- [ ] 2.2 Borrado por capas, del campo más huérfano al más usado.
- [ ] 2.3 Renombrar al dominio CAD lo que sí se consuma.
- [ ] 2.4 Commit aparte, barrido verde antes y después.

### OLA 3 — Las cotas dibujan lo que prometen (~2 h)
- [ ] 3.1 DIMVARs completos al render por cota.
- [ ] 3.2 Migración aditiva del esquema.
- [ ] 3.3 Golden del ciclo completo estilo → aplicar → render → DXF → reimportar.
- [ ] 3.4 (si sobra) `MLEADERSTYLE` y `TABLESTYLE` por DXF.

### OLA 4 — El plano grande deja de tardar 25 segundos (~1.5 h)
- [ ] 4.1 Atacar el cuello medido: subida por lotes, atlas de texto, culling de sombreados.
- [ ] 4.2 Perfil por etapas en el navegador con su spec de coste cero apagado.
- [ ] 4.3 Publicar evidencia actualizada, honesta aunque no llegue a 15 s.

### OLA 5 — Lijar el estudio (~1.5 h)
- [ ] 5.1 Migrar controles a mano a primitivas; bajar los 27 `shadow-2xl`.
- [ ] 5.2 Imports muertos del monolito + `--update` del trinquete.
- [ ] 5.3 Quitar «Flujo total» del cajetín y actualizar spec y goldens.
- [ ] 5.4 Barrido de nombres internos con vocabulario viejo.
- [ ] 5.5 Modo presentación.

### OLA 6 — Que lo pulido no se despula (~45 min)
- [ ] 6.1 Golden visual del embudo público en ambos temas.
- [ ] 6.2 Gate de contraste automático (4.5:1).
- [ ] 6.3 Gate de tono de voz.
- [ ] 6.4 Embudo público en móvil de verdad.

### OLA FINAL — La verdad medida (~30 min, obligatoria)
- [ ] F.1 Suite + goldens + trinquete + push, con la cifra publicada.
- [ ] F.2 Regenerar evidencia; reconciliar 186/200 vs 191/200.
- [ ] F.3 Recorrido de cliente completo, roces anotados.
- [ ] F.4 `INFORME_CAMPANA_PULIDO_20260822.md`.

### Cola de reserva
R.1 bloques dinámicos · R.2 nota de crédito CFDI · R.3 rol no dueño +
`SET app.tenant_id` · R.4 plantillas del CAD universal · R.5 andamiaje i18n ·
R.6 accesibilidad del estudio · R.7 documentar `check:dwg-evidence`.

---

## BITÁCORA

### OLA 0

**Arranque.** Árbol limpio en `fc9ba23`. Inventario inicial de
`apps/web/public/product/`: seis PNG con fecha 22-ago 02:37–02:39, anteriores a
la purga de identidad.

**0.1 — verificación del defecto denunciado.** Confirmado punto por punto sobre
`estudio-dark.png` (22-ago 02:37) y contra el producto vivo: la barra superior
dice `AXOS-CAD-STUDIO`, la barra de herramientas tiene `Aisle`, `Zone` y
`Equipment`, y la barra de estado dice `Layer Equipment`. El texto «Todas las
estaciones están en el plano» ya NO aparece en el producto vivo: sigue en
`lib/cad/design-checks.ts:104`, pero su panel no se monta en el estudio. La
captura vieja lo enseñaba porque es anterior a la purga.

**Suposición A-1 — el nombre del documento no es el modelo.** El título grande
que decía `AXOS-CAD-STUDIO` no era una etiqueta de la interfaz: era el NOMBRE del
documento, y el fixture de los goldens lo hacía coincidir con el `model` por
comodidad (`e2e/fixtures/cad-v1-backend.ts`, `name: seed.model`). `model` está
congelado; el nombre no. Se añade `name` opcional al sembrado —por defecto sigue
siendo el modelo, así que ningún golden cambia— y la captura siembra
«Casa Zaragoza · Planta baja». Un documento se llama como el proyecto.

**Suposición A-2 — la capa `Equipment` no se toca.** `Layer Equipment` en la
barra de estado es el NOMBRE de una capa, y `cadStarterLayers()` lo escribe en
el documento (`name: item.label`), de donde viaja al DXF que el cliente
descarga. Es dato persistido, y además es vocabulario CAD legítimo: el estándar
AIA nombra `A-EQPM` la capa de equipamiento de una planta arquitectónica. Se
queda. El guardián de identidad de la captura lleva esa excepción escrita con su
motivo. Lo que sí se retira es la HERRAMIENTA `Equipment` de la barra.

**0.2 — los dos defectos visuales, arreglados en el chrome.**

- *El globo de «Colaboración» tapaba el panel de propiedades.* Medido en el
  navegador: el muelle es `fixed right-3 top-24`, cae en x 1287–1428 y el panel
  derecho ocupa 1184–1440. Se posaba 141 px dentro del panel, justo sobre
  «Selecciona objetos para ver sus propiedades», y con dos superficies
  translúcidas superpuestas no se lee ninguna de las dos. Ahora se ancla al
  LIENZO —el editor ya publica su contenedor en `viewport-registry.ts`—, que es
  la única superficie del estudio sin texto propio. Se adapta solo al modo
  enfoque, a la paleta profesional y a la pantalla estrecha, porque el lienzo
  cambia de tamaño con ellos.
- *La línea de comandos pisaba la barra de estado.* Medido: el muelle es
  `absolute bottom-14` y termina en y=844; la barra de estado envuelve en dos
  renglones y su borde superior está en y=831. Trece píxeles de solape. Ahora el
  muelle mide la barra y se aparta
  (`components/cad/command-line/use-status-bar-clearance.ts`, con spec). Al
  monolito le cuesta UN token de clase:
  `bottom-14` → `bottom-[var(--cad-command-line-clearance,3.5rem)]`, con el
  valor de fábrica como respaldo.

**0.4 — el guardián.** `assertNoDeadProductVocabulary()` lee el texto
RENDERIZADO antes de disparar y se cae si aparece vocabulario del producto
muerto. Importa `forbiddenTextFragments` del MISMO gate que audita el código
(`scripts/cad/check-no-industrial-domain.mjs`) en vez de copiarlo, más una lista
de superficie para lo que el gate del código no puede prohibir: `AXOS-CAD-STUDIO`
está congelado y tiene que pasar el gate del código, pero no puede pintarse en la
portada como nombre del programa.

**DEFECTO DE PRODUCTO ENCONTRADO AL REGENERAR LA CAPTURA (no es del guion).**
Al alojar la puerta, el estudio PIERDE el encuadre: la cámara salta sola de
14,98 unidades/píxel a 59,02 —exactamente «Ajustar a la planta»— sin que nadie
lo pida. Medido paso a paso con el HUD del cursor en un punto fijo de pantalla:

```
[antes de teclear]        HUD en (772,534) = 7898.98, 6398.98
[tras enfocar la caja]    HUD en (772,534) = 23849.87, 16674.87   ← el salto
```

Consecuencia real: las tres ventanas siguientes se designaban contra
coordenadas que ya no existían —el clic caía a 30.225, fuera del dibujo— y el
comando se quedaba esperando un muro que nunca llegaba. Native se quedaba en 7
y ninguna prueba se enteraba.

Causa probable, localizada: el efecto de ciclo de vida de la escena
(`Layout3DEditor.tsx:6052`) depende de `[open, data]` y su limpieza destruye
cámara y controles (`7757`, `7762`). Si `data` cambia de IDENTIDAD —lo que hace
la respuesta del guardado automático— la escena THREE entera se reconstruye y la
cámara vuelve a su encuadre de fábrica. Pendiente de confirmar con una prueba
dirigida; si se confirma, es de primer orden: **cada guardado automático tira el
zoom y el paneo del usuario**, y además reconstruye la escena completa, lo que
toca de lleno a la OLA 4.

Rodeo en el guion, mientras tanto: reencuadrar y volver a medir antes de cada
designación. Está escrito en el propio guion con su porqué.

**DOS CAPTURAS MÁS QUE MENTÍAN, encontradas al revisarlas una por una.**

- `espacio-papel.png` **no era espacio papel.** El guion tecleaba `LAYOUT`, que
  no cambia de espacio: es el comando que ADMINISTRA presentaciones, y se
  quedaba pidiendo «[Nueva/COpiar/Renombrar/Suprimir/PLantilla/Definir/LIstar]»
  sobre el espacio modelo. La imagen se llamaba «espacio-papel» y enseñaba el
  modelo con un menú abierto. Ahora se va a la lámina por su PESTAÑA, que es por
  donde va una persona.
- `paleta-propiedades.png` **enseñaba un error en rojo.** `PROPERTIES` tecleado
  contesta «La paleta de propiedades no está montada en este espacio de trabajo.
  Use LIST para ver las propiedades de lo designado», y eso es lo que salía
  fotografiado. Ahora se abre con Ctrl+1 —el gesto real, el que ejercita el
  golden 49— y con una entidad designada, para que la paleta enseñe filas.

**DEFECTO ABIERTO: el texto no se pinta en el lienzo.** Los rótulos MTEXT y las
etiquetas de las COTAS no aparecen dibujados. Comprobado tres veces con capturas
independientes, y con una prueba dirigida: se teclea `T`, el diálogo confirma
«Escriba el párrafo», la entidad aparece en la lista del panel derecho como
MTEXT, se guarda con su texto y su altura (`height: 320`) — y en el lienzo no hay
nada. Lo mismo con las cotas: se dibujan la línea y las flechas, y el NÚMERO no.

Una cota sin número no es una cota, así que esto es de primer orden. El camino de
render existe entero —`entity-three.ts` rasteriza un sprite por MTEXT y el
pipeline por lotes tiene atlas de glifos (`render/text-atlas.ts`, `scene.ts`)—,
así que lo roto está en el cableado, no en la capacidad. NO está diagnosticado:
la insignia `cad-native-render-stats` decía «6 total» con siete entidades en el
documento, pero esa cifra se actualiza en `syncNativeScene` y estaba VIEJA, así
que no prueba que el pipeline se saltara el MTEXT. Queda para la OLA 4, que es
donde vive el pipeline de render, con el diagnóstico por hacer.

**DEFECTO ABIERTO: `LAYER` y `PROPERTIES` no abren su paleta desde la línea de
comandos.** Los dos contestan «no está montado en este espacio de trabajo» y
ofrecen la alternativa por CLI. No es un accidente —`palettes/use-palettes.ts`
lo dice con todas sus letras: «El gestor de capas y la paleta de propiedades
viven anclados y su visibilidad la decide el editor, así que aquí no se
anuncian»— pero sí es una carencia: son dos de los comandos más tecleados de
AutoCAD y en Valle Design no hacen lo que hacen allí. Cerrarlo es cablear la
visibilidad de las paletas ancladas al puente de comandos
(`palettes/palette-command-bus.ts`), que es trabajo dentro del monolito. Va a
PENDIENTES. La captura, mientras tanto, usa el gesto que SÍ funciona: el botón
para el gestor de capas y Ctrl+1 para las propiedades.

---

### DEFECTO GRAVE ENCONTRADO Y CERRADO: los muros no se imprimían

Fotografiando la lámina para la portada salió esto: el sombreado del baño, los
tres rótulos y las tres cotas aparecían en la hoja — **y la casa no**. Ni un
muro, ni una puerta, ni una ventana.

**Causa.** `renderEntity()` de `lib/cad/paper-space.ts` es una escalera de ramas
por tipo escrita cuando el documento iba por el esquema 3, y nunca creció. Cubre
`box`, `station`, `line`, `polyline`, `circle`, `arc`, `ellipse`, `spline`,
`text`, `mtext`, `dimension`, `hatch`, `mleader`, `connector` e `insert`. Todo lo
demás caía en un `return []` final, **sin advertencia**. El compilador lo
confirma sin lugar a dudas: en ese punto el tipo estrechado es
`CadSchema4Entity | CadSchema5Entity | CadWallEntity | CadOpeningEntity`, es
decir POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF, TABLE, SOLID3D, REGION,
WALL y OPENING. Doce tipos —incluidas las dos entidades BIM que son la bandera
del producto— desaparecían del PDF en silencio.

**Arreglo.** El registro de entidades ya sabe dibujarlos todos: es la misma
fuente que usa el visor y la exportación a DXF. En vez de añadir doce ramas
—que es lo que garantizó el agujero— la escalera termina preguntando al
registro, que crece solo con cada adaptador nuevo. Y lo que ni el registro sepa
trazar emite una advertencia `entity_not_plottable` en vez de perderse.

**Prueba.** `src/lib/cad/paper-space-plots-every-entity.spec.ts` — el muro llega
a la lámina con su CONTORNO (44 puntos, dos caras separadas por el grosor), no
con su eje; cero advertencias; y la regla queda fijada en su forma general
(«todo tipo del registro se imprime»), no como un caso particular del muro.
`plot-fidelity-evidence` sigue verde: error de escala 2,8e-14 mm.

**OLA 0 — CERRADA.** Estado de las seis capturas, verificadas una por una:

| Captura | Antes | Ahora |
| --- | --- | --- |
| `estudio-dark` / `estudio-light` | «AXOS-CAD-STUDIO» de título, herramientas `Aisle`/`Zone`/`Equipment`, «Todas las estaciones están en el plano», el globo de Colaboración encima del panel de propiedades, la línea de comandos pisando la barra de estado, y un dibujo de 4 muros + 2 cotas | «Casa Zaragoza · Planta baja», herramientas `Corridor`/`Area`/`Symbols`, `Layer Layout`, nada superpuesto, y una planta de 18 entidades: 6 muros que resuelven sus esquinas, 1 puerta con su barrido, 3 ventanas alojadas, 1 sombreado asociativo sobre su polilínea de contorno, 3 rótulos de local y 3 cotas |
| `paleta-propiedades` | la línea de comandos enseñando en rojo «La paleta de propiedades no está montada en este espacio de trabajo» | la paleta abierta con Ctrl+1 y una entidad designada |
| `paleta-capas` | el gestor abierto, pero con el error de `LAYER` en el diálogo | el gestor abierto por su botón |
| `espacio-papel` | el espacio MODELO con el menú de `LAYOUT` abierto | la lámina A1 de verdad: muros hachurados, puerta con barrido, ventanas, rótulos, cotas y cajetín con el proyecto |
| `linea-de-comandos` | correcta | correcta |

Y el guardián `assertNoDeadProductVocabulary()` corre antes de cada disparo del
estudio: si el vocabulario del producto muerto vuelve, no hay foto.

**Lo que la OLA 0 dejó abierto** (todo con su porqué arriba):
1. El texto (rótulos MTEXT y etiquetas de cota) no se pinta en el LIENZO. Sí se
   pinta en la lámina, así que el motor sabe hacerlo. → OLA 4.
2. Colocar una puerta pierde el encuadre de la cámara. → OLA 4 / PENDIENTES.
3. `LAYER` y `PROPERTIES` no abren su paleta desde la línea de comandos.
4. La capa activa de fábrica ya no es `equipment`, pero sigue siendo `layout` y
   no la que la plantilla considera suya (`MUROS` en la mexicana).

---

## Reanudación tras la caída de sesión (23-08)

La sesión murió a las 13:22 con la OLA 0 cerrada y sin commitear. La campaña de
cimientos la rescató en `298d610` y la subió a `main`. Al retomar:

- **`origin/main` había avanzado** de `fc9ba23` a `298d610`, con la campaña de
  cimientos encima. `npm ci` fue obligatorio: el árbol nuevo trae dependencias
  que esta máquina no tenía (`openapi-typescript`).
- **Un gate NUEVO cobró la OLA 0.** `check:lint-budget` —trinquete de avisos que
  estrenó cimientos— falló con 10 avisos de `react-hooks/set-state-in-effect`
  contra un presupuesto de 9. El aviso tenía razón: el muelle de colaboración
  medía su sitio con `useState` dentro del efecto, y ese efecto se dispara con
  CADA cambio de tamaño del lienzo —que en un CAD cambia mientras se arrastra el
  borde de una paleta—, así que era un render de React por cuadro de arrastre.
  Ahora la posición se escribe en el nodo por una ref. Trinquete: 545/549.
- **R.7 ya estaba hecho.** `docs/onboarding/GATES.md` documenta que
  `check:dwg-evidence` necesita `VALLE_DWG_CORPUS_MIRROR` y que sin él es un
  falso rojo de entorno. Se tacha de la cola de reserva.
- **F.2 (186/200 vs 191/200) quedó SIN OBJETO.** No hay que reconciliar nada: la
  campaña de cimientos sustituyó la rúbrica entera. Ya no hay un número, hay
  dos, y con otro denominador: **HOY 154/175 (88 %)** y **DESTINO 189/220
  (85,9 %)**, rúbrica `2026-08-22.1`. Los dos números viejos pertenecen a la
  rúbrica `2026-08-20.1`, que ya no existe. Queda comprobado, eso sí, de dónde
  venía la diferencia: los cinco puntos estaban enteros en Import/export DWG
  (2/8 committeado contra 7/8 calculado), y la matriz llevaba desde la campaña
  DWG del 21-08 sin regenerarse.

**Estado de los gates al cerrar la OLA 0** (base `298d610` + `npm ci`):

| Gate | Resultado |
| --- | --- |
| `check:cad` | verde hasta `check:dwg-evidence` |
| `check:dwg-evidence` | **falso rojo de entorno** — sin `VALLE_DWG_CORPUS_MIRROR`; documentado en `GATES.md`; confirmado con corrida de control sobre HEAD limpio |
| `check:dwg` | verde (cero bundles admitidos, sin origen configurado) |
| `check:lint-budget` | verde — 545 avisos, presupuesto 549 |
| `typecheck` | verde — 6/6 workspaces |
| `test` | verde — **384/384 specs** |
| `lint` | verde — 0 errores (545 avisos, dentro del trinquete) |
| `build` | verde — 5/5 workspaces |

Ojo con `build`: falló una vez por `.next/dev/types/routes.d.ts` corrupto, que
es basura del servidor de desarrollo, no del código. Borrar `.next` lo arregla.

**Empujado a `main`: `30ae4f6`.**

### OLA 1 — los seis goldens rojos

**Corrida de control primero, como manda el método.** Los seis, sobre HEAD sin
tocar: 11 fallos de 16 casos. Cuatro causas distintas, no seis.

**Causa 1 — el esquema (3 goldens: 47-solids, 53, 54).** Los tres afirmaban
`saved.meta.schema).toBe(6)` y el documento guarda 9. La cola pedía averiguar
quién miente antes de tocar el número, y miente la aserción: `CAD_DOCUMENT_SCHEMA`
vale 9, la migración escribe esa constante, y su propia spec demuestra que la
cadena v3→v9 es ADITIVA («ninguna REGION ni SOLID3D fabricados… el 8→9 conserva
frozen y layerStates sin materializar nada en quien no los traía»). El 6 era el
vigente el día que se escribieron las pruebas; tres subidas deliberadas y
documentadas después —v7 OPENING, v8 cámara de ventana, v9 estados de capa— las
dejó diciendo una verdad caducada. Ahora comparan contra la CONSTANTE y fijan
además el suelo (`>= 6` para el muro, `>= 5` para el sólido), que es lo que no
puede bajar. Así no vuelven a pudrirse en la próxima subida.

**Causa 2 — el contador de LISP (47-lisp-appload).** Pedía «1 comando» y el
encabezado decía «1 rutina · 5 comandos». El contador tenía razón y la interfaz
mentía: las rutinas son las DEL ESTUDIO y los comandos son TODOS los tecleables,
incluidos los de las cuatro rutinas de FÁBRICA que el producto trae puestas. Dos
poblaciones distintas presentadas como una, contradiciendo a la lista de abajo
—que sí enseña las de fábrica—. El encabezado ahora las nombra: «1 rutina del
estudio · 5 comandos disponibles». La aserción se queda con la mitad que la
prueba controla; contar el total ataría el golden al catálogo de fábrica.

**Causa 3 — la capa de comentarios nunca recibió un clic (55).** `setPlacing`
CONCATENABA `pointer-events-auto` sobre una base que ya llevaba
`pointer-events-none`. En el atributo `class` el orden no decide nada: decide la
hoja de Tailwind, y ahí gana `none`. Anclar un comentario sobre el plano no
funcionó NUNCA —el lienzo de THREE se quedaba el clic— y ninguna aserción de
dominio podía verlo: la capa existía, era visible y su `data-placing` decía
«true». Ahora la base no lleva la utilidad y se alterna de verdad. Con spec
propia (`collab-overlay-pointer.spec.ts`), que es de una línea y no lo habría
dejado pasar.

**Causa 4 — el muelle de colaboración se comía los clics de media interfaz
(21).** Éste es el hallazgo gordo, y explica por qué el golden 21 llevaba meses
en rojo: el globo plegado, en `right-3 top-24`, cae sobre la fila de pestañas de
la biblioteca. El mensaje estaba escrito desde el principio —«<aside
cad-collab-dock> subtree intercepts pointer events» intentando pulsar
`cad-library-tab-xrefs`»— y nadie lo había leído.

### El error propio, medido y corregido

La OLA 0 había movido ese muelle al LIENZO para que dejara de tapar el panel de
propiedades. **Fue un cambio malo y el barrido lo cobró**: seis specs que no
tocan la colaboración —12, 20, 27, 39, 46 y 50— con quince mensajes nombrando
`cad-collab-toggle`. Cambié un texto tapado por los clics del dibujo, que es
peor, y era exactamente la lección que el autor original había dejado escrita en
ese archivo.

El segundo intento —reservar sitio en el panel derecho con una variable de CSS—
también falló, y también medido: empujar la columna 99 px hacia abajo sacó de la
vista las filas que el golden 39 edita. Tres goldens en rojo (12:117, 39:219,
39:268), confirmados contra corrida de control sobre `9835240`: **3 fallos allí,
9 en mi árbol**. Míos.

Y una tercera causa propia, del mismo tipo: la holgura de la barra de estado
subía el ENVOLTORIO de la línea de comandos, que es una columna compartida con
el acompañante de los primeros cinco minutos y la consola AutoLISP. Subirlo 21
px subía los tres, y los BOTONES del acompañante —que sí reclaman el ratón—
aterrizaban sobre las coordenadas del plano que esas pruebas pinchan. Aislado
neutralizando el hook: 14 de 14 en verde. Ahora se desplaza **sólo la línea**,
con `position: relative`, que mueve su caja sin mover el hueco de sus hermanas.

**La salida buena para el muelle no era elegir a quién tapar: era no tapar.**
Esquina INFERIOR derecha. El contenido del panel derecho fluye desde arriba, así
que abajo no hay ni texto ni pestañas; y no está sobre el lienzo, así que no
roba clics. Cero coste para el editor: ni una línea, ni un `useState`, ni un
token de clase. Con spec que deja escrito por qué no vuelve a ninguno de los dos
sitios anteriores (`collab-dock-position.spec.ts`).

Y colocando una chincheta el muelle se aparta del ratón entero: es una orden
explícita —«pincha un punto del plano»— y ningún panel flotante puede quedársela.
Cancelar sigue estando en Escape, que es lo que anuncia la pista sobre el dibujo.

### OLA 1 — LA CIFRA, con el árbol quieto

**Barrido completo: 170 de 174 casos verdes (49 min).** Son 87 goldens × 2
navegadores. Quedan 3 fallos, en 2 goldens:

| Golden | Navegador | Estado |
| --- | --- | --- |
| `46-cad-pointer-engine:177` | chromium y firefox | rojo ANTES de esta campaña |
| `20-cad-multiple-viewports:47` | sólo firefox | rojo ANTES de esta campaña |

**85 de 87 goldens en verde**, desde los 81/87 con que empezó la campaña. Los
seis rojos heredados están cerrados y ninguno se cerró relajando nada: cuatro
defectos de PRODUCTO arreglados (la capa de comentarios que nunca recibía un
clic, el muelle que se comía las pestañas, el encabezado de LISP que mezclaba
dos poblaciones, la holgura que subía la columna entera) y tres aserciones de
esquema actualizadas contra la constante —no contra un número— con la evidencia
de que las tres subidas fueron deliberadas, documentadas y aditivas.

Que los dos restantes son anteriores no es una suposición: la **corrida de
control sobre `9835240`** —el árbol tal y como lo dejó la campaña de cimientos,
antes de que mi OLA 0 entrara— da exactamente esos 3 fallos y ningún otro.

**Y un aviso para quien venga:** la campaña de cimientos cerró sin correr el
barrido de goldens (lo delegó por escrito a esta OLA). Sus 13 commits nunca se
midieron contra la suite e2e. Éste es el primer barrido del árbol fusionado.
