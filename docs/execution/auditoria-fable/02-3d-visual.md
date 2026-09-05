# Auditoría · Dimensión 02 — Visualización 3D: estilos visuales, render, materiales, luces, navegación

**Fecha:** 2026-09-05
**Quién juzga:** arquitecto con veinte años de despacho, suscripción completa de
AutoCAD, la usa entera todos los días. Abre Valle Design por primera vez con la
intención honesta de cambiarse.
**Alcance:** estilos visuales, materiales, luces, sol y ubicación geográfica,
cámaras, render, ViewCube, SteeringWheels, órbita, paseo y vuelo, secciones
vivas, vistas guardadas, ventanas múltiples.
**Método:** lectura del árbol real (`Grep`/`Glob`/`Read`), del registro de 294
comandos (`command-manifest.ts`), de los 105 goldens y de
`docs/competitive/rubric.json`. Una medición ejecutada con `tsx` sobre el kernel
B-rep real (§4.1). Ningún código de producto tocado.

---

## 0. Antes de nada: esta dimensión no está en la rúbrica

La rúbrica tiene 36 filas. Las recorrí una a una
(`node -e` sobre `docs/competitive/rubric.json`, volcado de `categories` y
`criteria`). **Ninguna** habla de estilos visuales, materiales, luces, sol,
render, cámaras, ViewCube, SteeringWheels, paseo, secciones vivas, vistas
guardadas ni ventanas múltiples.

Lo más cercano son tres filas, y ninguna mira esto:

| Fila | Qué mide | Qué NO mide |
| --- | --- | --- |
| `brep` (7/7) | topología, booleanas, NURBS, STEP/IGES, «el editor lo usa» | cómo se VE |
| `modeling3d` (5/5) | BOX…POLYSOLID tecleables, SOLIDEDIT, la cota en el DXF | cómo se VE |
| `performance` (11/12) | índice espacial, LOD, presupuesto, SLO de navegador | el 3D no entra: el SLO es de PANEO en planta |

Consecuencia práctica: **las dos filas 3D de la rúbrica están a tope (12/12) y
en esta dimensión el producto no llega a 3/10.** La rúbrica no miente —mide lo
que dice medir— pero el titular está leyendo «3D: completo» sobre un producto
que todavía no puede enseñarle el modelo a un cliente. Esa distancia entre el
tablero y la pantalla es, por sí sola, el hallazgo más caro del informe.

`docs/parity/ESCALERA.md` sí es honesto: sus renglones 178, 373 y 374 declaran
«todavía no» para la cota en pantalla, la ventana de presentación con cámara 3D
y la familia `SECTIONPLANE`/`LIVESECTION`. Bien. Pero la ESCALERA no se puntúa y
la rúbrica sí.

**Y no hay un solo artefacto de evidencia.** `docs/cad/evidence/` tiene 51
archivos —`browser-slo-100k.json`, `touch-support.json`,
`wall-mass-render-benchmark.json`, `sketchup-migration-matrix.json`…— y ni uno
sobre estilos visuales, navegación 3D, luz o render.

---

## 1. Veredicto

> **Se puede orbitar el modelo y verlo sombreado, pero no se puede cortar, ni
> materializar, ni asolear, ni llevarlo a la lámina — y lo poco que sí se
> sombrea se dibuja con las caras del revés. Hoy esto es un visor de maqueta,
> no la ventana con la que un despacho le enseña el proyecto a su cliente.**

**Nota contra AutoCAD completo en esta dimensión: 3 / 10.**

Los tres puntos se los gana por cosas concretas y verificadas: la tabla de los
diez encuadres normalizados con sus vectores explícitos y su `up` ortogonalizado
(`view-3d.ts`), la eliminación de líneas ocultas por CPU desde la TOPOLOGÍA del
sólido con fallo cerrado (`solid3d-three.ts:83`), la política de cámara sin
amortiguación y con la rueda anclada al cursor (`camera-policy.ts`), y tres
piezas que AutoCAD no tiene: minimapa, exportación GLB y modo Recorrido en el
navegador.

Los siete que le faltan son de bulto: sin render, sin materiales, sin luces
salvo un plató fijo, sin sol geográfico, sin corte vivo, sin vista 3D en la
lámina, sin ventanas múltiples, con seis de los diez estilos visuales ausentes,
con el estilo visual que sí existe alcanzando SÓLO a `solid3d` —o sea a nada de
lo que un arquitecto modela—, y con un defecto de orientación de caras que
afecta a los tres constructores de geometría nativa a la vez.

### El lunes, en concreto

Lo primero que hago cada semana es **un corte por un muro, acotarlo y meterlo en
la lámina**. Aquí:

- `SECTIONPLANE` no existe (no está en los 294 comandos del manifiesto).
- `SECTION` existe pero sólo acepta `solid3d` (`solids-modify.ts:378`,
  `selectedSolids`) — mis muros son entidades `wall`/`box`, así que responde
  «no hay sólidos» sobre un modelo lleno de ellos.
- El plano de corte sólo puede ser VERTICAL y por dos puntos en planta
  (`solids-modify.ts:254`, `verticalPlane`) — nada de un corte horizontal ni de
  tres puntos.
- Lo que SÍ hay es `SOLVIEW`/`SOLDRAW` y `FLATSHOT`, que sacan el alzado y la
  planta cortada a la altura del antepecho como LÍNEAS del dibujo, con el hueco
  de la puerta restado (golden 92). Eso es real y es bueno. Pero no es un corte:
  es una fotocopia. No se actualiza, no se ve en el modelo, y no puedo mirar
  dentro del edificio girando la sección con el ratón.

Lo segundo es **enseñarle al cliente cómo va a quedar**. Aquí no hay render, no
hay materiales con textura, y el sol es un par de deslizadores que no saben en
qué ciudad estoy ni qué día es.

---

## 2. Lo que ya existe y está bien

No es poco, y hay que decirlo antes de la lista de agravios.

### 2.1 La tabla de estilos y la aritmética de órbita
`apps/web/src/lib/cad/view/visual-styles.ts` (219 líneas). Cuatro estilos con el
nombre de AutoCAD —Alámbrico, Oculto, Sombreado, Sombreado con aristas— como
tabla de decisiones PURA. Distingue `occludes` (la GPU tapa con caras del color
del fondo) de `removesHiddenEdges` (la geometría no envía la arista), que es
exactamente la distinción que hace que «Oculto» no acabe siendo un alias de
«Alámbrico». `resolveCadVisualStyle` devuelve `null` ante lo desconocido en vez
de caer al estilo por defecto. La órbita acota la elevación a ±89,9° con el
motivo escrito (la base degenera en el polo y THREE da `NaN`).

### 2.2 Los diez encuadres normalizados, con vectores y no con ángulos
`apps/web/src/lib/cad/view/view-3d.ts:170-230`. Cada vista declara `offset` y
`up` EXPLÍCITOS en vez de derivarlos de azimut/elevación, precisamente para que
SUPERIOR sea 90° exactos y no 89,9°. El `up` de las isométricas está
ortogonalizado por Gram-Schmidt (`1/√6`, `2/√6`) con la explicación de por qué
declarar una base que no es base es un error invisible. Esto está mejor pensado
que lo que uno esperaría.

### 2.3 Órbita, encuadre y acercamiento TECLEABLES
`apps/web/src/lib/cad/engine/commands/view-navigation-3d.ts` (381 líneas):
`3DORBIT`, `3DFORBIT`, `3DPAN`, `3DZOOM`, `VPOINT` con sus alias, todos
transparentes (se pueden meter a mitad de un `LINE`), todos guionizables.
`VPOINT Rotar` convierte el ángulo de AutoCAD (desde +X, antihorario) al azimut
del motor (desde el norte) con la comprobación escrita en el comentario. `VIEW`
ofrece además las diez ortogonales porque es donde un usuario de AutoCAD las
busca (`view-navigation.ts:314-322`).

### 2.4 Líneas ocultas EXACTAS por CPU, con fallo cerrado
`apps/web/src/lib/cad/solid3d-three.ts:83-127` (`buildCadSolidVisibleEdges`) +
`lib/cad/view/hidden-lines.ts`. Sobre un cuerpo convexo clasifica aristas por la
TOPOLOGÍA (no por la malla triangulada) y descarta las coplanares por el diedro
REAL. Sobre un cuerpo cóncavo devuelve `null` y vuelve al búfer de profundidad
—fallo cerrado, no un dibujo con aristas de menos— y lo DECLARA en
`group.userData.hiddenLineRemoval`. El recálculo se dispara cada 5° de giro
(`solid-shade-host.ts:114`, `CAD_HIDDEN_LINE_REFRESH_DEG`) para no reconstruir
por cuadro. Esto es trabajo de CAD de verdad.

### 2.5 La política de cámara, en un solo sitio
`apps/web/src/components/cad/viewport/camera-policy.ts` (242 líneas, 23
comprobaciones). `enableDamping = false` con el motivo escrito («AutoCAD es 1:1 e
instantáneo, el plano se para donde lo paras»); `zoomToCursor = true` con la
medición del golden 85 (1.394 unidades de deriva antes, <10 % después); el botón
central encuadra en los dos modos; un dedo designa y dos son la cámara. Y se
aplica AL CREAR los controles, no sólo al conmutar de modo, con la lección
escrita de por qué.

### 2.6 ViewCube, barra de navegación y minimapa
`CadViewCube.tsx` (145 líneas) dibuja las tres caras en isométrica fija más
posterior/izquierda/home como satélites, y no inventa ni un preset: los seis son
los seis reales de `camera-view-presets.ts`. La cabecera del archivo declara
honestamente que un ViewCube de verdad se orienta con la cámara y se arrastra, y
que eso todavía no. `CadNavigationBar.tsx` da encuadrar-todo y
encuadrar-selección. `CadOverviewMinimap.tsx` (215 líneas) es un panel de
navegación **que AutoCAD no tiene**.

### 2.7 Recorrido a pie, GLB, PNG, importación de mallas
`Layout3DEditor.tsx:2523` (`toggleWalk`): baja la cámara a altura de ojo,
desactiva OrbitControls, mirar arrastrando y WASD. `exportGltf`
(`lib/cad/glb-export.ts`) exporta el modelo —con la arquitectura nativa, no sólo
los grupos heredados, y con spec de ida y vuelta— a `.glb`, que se abre en
Blender y en cualquier visor del mundo. `exportPng` (`Layout3DEditor.tsx:12496`)
captura el visor. `lib/cad/interop/` lee OBJ, STL, glTF y Collada con límites
declarados. **AutoCAD no exporta glTF de fábrica.**

### 2.8 Sol con sombras reales
`Layout3DEditor.tsx:2162` (`applySun`) mueve una `DirectionalLight` con
`castShadow`, mapa de sombras PCFSoft de 2048² dimensionado a la huella
(`:6024-6036`). Hay una luz ambiente 0,55, una hemisférica cielo/suelo y la
direccional a 1,15. Es un plató decente para una maqueta.

### 2.9 De 3D a documentación: la mitad que sí resuelve
`FLATSHOT`/`SOLPROF` aceptan los MUROS del arquitecto —no sólo `solid3d`— y
RESTAN los huecos de puerta, con el motivo escrito en
`lib/cad/flatshot-solids.ts:1-43` y golden 92 sobre el documento del servidor.
`SOLVIEW`/`SOLDRAW` sacan planta cortada, alzados, corte y detalle a la lámina
con rótulo, marca de corte y globo. Este es el camino que hoy hace que modelar
compense, y funciona.

---

## 3. Los huecos, por lo que más duele

### H-1 · El estilo visual sólo alcanza a `solid3d`, o sea a nada de lo que modela un arquitecto — BLOQUEANTE

**AutoCAD:** `VSCURRENT` cambia cómo se ve TODO el modelo — sólidos, mallas,
superficies, muros de AEC, bloques, todo.

**Valle hoy:** `VSCURRENT` emite `{ kind: "visual-style", styleId }`
(`view-visual.ts:90`), el puente lo enruta a
`solidShadeHost.applyVisualStyle` (`studio-engine-bridges.ts:144`), y ese
anfitrión filtra:

```ts
// apps/web/src/components/cad/viewport/solid-shade-host.ts:321-324
for (const entity of document.entities)
  if (entity.type === "solid3d" && !hiddenLayers.has(entity.layer))
    wanted.set(entity.id, entity);
```

Los muros, huecos, losas, cielorrasos y cubiertas los construye
`CadNativeMassHosts` (`native-mass-hosts.ts` → `wall-solid-host.ts` +
`room-solid-host.ts`), que **no tiene ni un parámetro de estilo**: `grep -n
"style" native-mass-hosts.ts` no devuelve nada. El modelo heredado de activos lo
construye `asset-archetypes.ts`, tampoco. Tubería de Plant y símbolos de MEP,
tampoco.

**El flujo que rompe:** dibujo una planta con `WALL`, `DOOR`, `SLAB` y `ROOF`
—que es literalmente lo que el toolset Architecture ofrece— cambio a 3D, tecleo
`VSCURRENT Alámbrico` y la línea de comandos me contesta **«Estilo visual:
Alámbrico.»** y en pantalla no cambia nada. Es un éxito falso en un producto
cuya fila `integrity.commands` vale 5 puntos y presume de cero éxitos falsos.

**Esfuerzo:** varios días.
**Cómo se construye:** subir el estilo a un estado de VISOR compartido, no del
anfitrión de sólidos. (a) `CadViewportVisualStyle` como pequeño publicador fuera
de React (mismo patrón que `navigation-host.ts`), con `subscribe()`. (b) Los
tres constructores —`solid3d-three.ts`, `wall-solid-three.ts`,
`room-solid-three.ts`— ya reciben `options`; añadirles `style?: CadVisualStyle`
y aplicar la MISMA tabla: `faces`/`edges`/`occludes`/`opacity`. La tabla ya es
pura y no conoce THREE, que es justo lo que hace esto barato. (c)
`CadWallSolidHost.sync` y `CadArchitecturalMassHost.sync` se suscriben y
reconstruyen al cambiar el estilo, exactamente como ya hace
`CadSolidShadeHost.setStyle` (`solid-shade-host.ts:283`). (d) El bus lo alimenta
un solo `applyVisualStyle` que reparte a los tres anfitriones y devuelve el
número de objetos reconstruidos.
**Cómo se verifica:** golden que dibuja `WALL` + `SLAB` + un `BOX`, teclea
`VSCURRENT A` y afirma sobre `data-mesh-count`/`data-vertex-count` de
`Cad3DSolidDiagnostics` (que ya publica el conteo REAL de la escena, no una
lista de botones) que las mallas de cara desaparecieron y quedan sólo las
aristas. Y el mensaje pasa a decir cuántos objetos cambió: sobre un documento
sin nada sombreable, cero, y lo dice.
**Ficheros:** `components/cad/viewport/solid-shade-host.ts`,
`components/cad/viewport/wall-solid-host.ts`,
`components/cad/viewport/room-solid-host.ts`,
`components/cad/viewport/native-mass-hosts.ts`, `lib/cad/wall-solid-three.ts`,
`lib/cad/room-solid-three.ts`, `lib/cad/solid3d-three.ts`,
`components/cad/command-line/studio-engine-bridges.ts`.

---

### H-2 · No hay corte vivo: no puedo mirar dentro del edificio — BLOQUEANTE

**AutoCAD:** `SECTIONPLANE` planta un objeto plano de sección en el modelo,
`LIVESECTION` lo enciende y el modelo se abre EN VIVO: arrastro el plano con un
grip y veo el interior mientras se mueve. `SECTIONPLANEJOG` hace el corte
quebrado. El objeto de sección se guarda en el DWG, se acota, y
`SECTIONPLANETOBLOCK` lo convierte en geometría 2D cuando hace falta.

**Valle hoy:** cero. `grep -rn "clippingPlanes\|localClipping"` sobre
`apps/web/src` no devuelve **ni una línea** — el mecanismo de THREE que resuelve
esto ni se ha tocado. `SECTIONPLANE` y `LIVESECTION` no están entre los 294
comandos. Lo que hay es `SECTION` y `SLICE`, y los dos:
- sólo aceptan `solid3d` (`solids-modify.ts`, `selectedSolids`),
- sólo con un plano VERTICAL por dos puntos en planta (`solids-modify.ts:254`),
- `SECTION` produce una `region` estática y `SLICE` parte el sólido de verdad.

**El flujo que rompe:** el estructurista me manda el modelo, quiero ver cómo cae
la viga sobre el muro. En AutoCAD son dos clics. Aquí tengo que teclear
`SOLVIEW`, generar una lámina, y mirar un dibujo de líneas que no puedo girar.
Y sobre un modelo de muros ni eso: `SECTION` me responde «no hay sólidos».

**Esfuerzo:** varios días (la mitad de corte vivo), semanas (con el objeto de
sección persistido y acotable).
**Cómo se construye, por fases:**
1. **Corte vivo, sin formato nuevo.** `renderer.localClippingEnabled = true` y
   un `THREE.Plane` en `material.clippingPlanes` de los tres constructores de
   masa. El plano vive en el ESTADO DEL VISOR igual que el estilo visual (H-1
   comparte el bus). Comando `SECTIONPLANE` que pide dos puntos + `Ortogonal`
   (Frontal/Lateral/Planta) y una elevación; `LIVESECTION On/Off`. Con eso ya se
   ve el interior y se orbita.
2. **La cara de corte no queda hueca.** Un plano de recorte deja el sólido
   abierto y se ve el interior de las caras. Se tapa con el truco clásico de
   `stencil` (dos pasadas: back-faces incrementando, front-faces decrementando,
   y un quad del color de corte donde el stencil no es cero). Es exactamente lo
   que AutoCAD llama «relleno de corte».
3. **El objeto de sección, después.** `CadSectionPlaneEntity` con `origin`,
   `normal`, `path?: CadPoint3[]` (quebrado) y `depth?` — que es LO MISMO que la
   ESCALERA ya declara pendiente para `CadViewportSectionPlane`, así que
   conviene resolverlo una vez para los dos. **Formato persistido: decisión del
   titular.**
**Cómo se verifica:** spec en Node sobre el módulo puro del plano (dado un
cuerpo y un plano, qué caras quedan y cuál es la huella de corte, contra
`sectionLoopsOfSolid` que YA existe y ya sabe calcularla) + golden que enciende
`LIVESECTION` sobre dos muros y afirma que el conteo de vértices visibles bajó y
que un rayo al centro del modelo golpea una cara interior.
**Ficheros:** `lib/cad/engine/commands/` (módulo nuevo `view-section.ts`),
`lib/cad/solid3d-section.ts` (ya existe la aritmética), los tres constructores,
`Layout3DEditor.tsx` (una línea: `localClippingEnabled`).

---

### H-3 · Los cuatro alzados verdaderos y la vista inferior no se pueden ver — ALTA

**AutoCAD:** `VPOINT` / `-VIEW Frontal` pone la cámara exactamente al nivel del
objetivo. Un alzado es un alzado.

**Valle hoy:** la tabla es correcta —`view-3d.ts:186-222` declara Frontal,
Posterior, Izquierda y Derecha con `elevationDeg: 0` e Inferior con `−90`— y el
controlador las aplica bien (`view-controller.ts:357`, `applyStandardView`).
Pero el visor tiene OrbitControls encima:

```ts
// apps/web/src/components/cad/viewport/camera-policy.ts:145
controls.maxPolarAngle = plan ? 0.05 : Math.PI / 2.05;
```

y el bucle de cuadros llama a `controls.update()` en cada cuadro
(`Layout3DEditor.tsx:7687`). `OrbitControls.update()` recalcula el esférico
desde `camera.position − controls.target` y **acota φ**:

```js
// three 0.185.1, examples/jsm/controls/OrbitControls.js:744
this._spherical.phi = Math.max( this.minPolarAngle, Math.min( this.maxPolarAngle, this._spherical.phi ) );
```

`Math.PI / 2.05 ≈ 1,5325 rad ≈ 87,8°`. Un alzado pide φ = 90°; la vista inferior
pide φ = 180°. Las cinco se recolocan **en el cuadro siguiente**, sin decir nada.

Y el otro camino tampoco da un alzado: el preset «front» del ViewCube coloca la
cámara en `(cx, d·0.5, cz + d·1.3)` (`camera-view-presets.ts:98`), o sea a 69°
del cenit — una vista de tres cuartos, no un alzado.

**El flujo que rompe:** quiero mirar la fachada de frente para comprobar que los
antepechos se alinean. Ni tecleando ni con el cubo. Y `VPOINT INferior` para
mirar el fondo de losa —que es como se revisa un descuelgue— salta a casi
horizontal.

**Esfuerzo:** un día.
**Cómo se construye:** el conflicto es de propiedad: dos dispositivos mandan
sobre la misma cámara. Una función `applyCadCommandedView(controls, camera)` que
(a) suba `maxPolarAngle` a `Math.PI − 1e-4` mientras la vista la manda un
COMANDO, (b) copie el objetivo del controlador a `controls.target` antes de
recolocar, y (c) llame a `controls.update()` UNA vez para que el esférico interno
adopte la nueva pose sin pelearse. El tope de 87,8° se conserva sólo para el
ARRASTRE (que es de lo que protegía: la matriz degenera en el rasante), no para
lo tecleado — y la vista inferior se pide por su nombre, que es exactamente el
argumento que ya está escrito en `view-3d.ts:11-26` sobre el polo.
**Cómo se verifica:** golden que teclea `VPOINT FR`, espera dos cuadros y lee la
pose de la cámara por la sonda de diagnóstico: `|position.y − target.y| < 1e-3`.
Y el mismo para `VPOINT IN` con `position.y < target.y`. Hoy ese golden no
existe: **`grep -rn "VPOINT\|3DORBIT" apps/web/e2e/` no devuelve nada.**
**Ficheros:** `components/cad/viewport/camera-policy.ts`,
`components/cad/command-line/navigation-host.ts`,
`components/cad/editor/Layout3DEditor.tsx`.

---

### H-4 · No hay render, ni materiales, ni luces — ALTA

**AutoCAD:** `RENDER`, `RENDERCROP`, `RPREF` con presets de calidad; biblioteca
de materiales con texturas, mapeo UV (`MATERIALMAP`), asignación por capa
(`MATERIALATTACH`); `POINTLIGHT`, `SPOTLIGHT`, `DISTANTLIGHT`, luces web con
fotometría, `LIGHTLIST`.

**Valle hoy:** de los 294 comandos del manifiesto, **ninguno** es `RENDER`,
`RPREF`, `MATERIALS`, `MATBROWSER`, `MATEDITOR`, `LIGHT`, `POINTLIGHT`,
`SPOTLIGHT`, `DISTANTLIGHT` ni `LIGHTLIST` (verificado con
`grep -rl '"NOMBRE"' apps/web/src`, cero coincidencias para cada uno).

«Materiales» son cinco colores planos, y sólo para muros:

```ts
// apps/web/src/lib/cad/wall-materials.ts:47-53
concrete: { label: "Concreto", color: 0x9ca3af },
brick:    { label: "Ladrillo", color: 0xb45309 },
drywall:  { label: "Tablaroca", color: 0xe5e7eb },
wood:     { label: "Madera",   color: 0x8a5a34 },
stucco:   { label: "Aplanado", color: 0xd6cfc4 },
```

Un `solid3d` es un solo gris cableado (`solid3d-three.ts:57`,
`SOLID_COLOR = 0x94a3b8`) — **ni siquiera hereda el color de su capa**. No hay
una sola textura en todo el árbol: los cuatro usos de `CanvasTexture` son atlas
de TEXTO y etiquetas (`render/text-atlas-three.ts`, `entity-three.ts:186`,
`viewport/scene-objects.ts`), y `TextureLoader` no aparece.

La luz es un plató fijo de tres luces montado una vez
(`Layout3DEditor.tsx:6021-6037`) que nadie puede tocar.

**El flujo que rompe:** el cliente pregunta «¿y con ladrillo aparente cómo se
ve?». No hay respuesta dentro del producto. Tengo que exportar `.glb` y abrirlo
en Blender, que es exactamente la fricción que pago la suscripción por evitar.

**Esfuerzo:** semanas.
**Cómo se construye, por fases y sin morir en el intento:**
1. **`MATERIAL` como color heredable, primero.** Extender
   `cadWallMaterialStyle` a un `CadMaterialLibrary` con `{ id, label, color,
   roughness, metalness }` y un adjunto POR CAPA (`MATERIALATTACH` sobre el
   nombre de capa, sin campo nuevo por entidad — la capa ya viaja). Cambiar
   `MeshLambertMaterial` por `MeshStandardMaterial` en los tres constructores
   (los arquetipos heredados ya lo usan, `asset-archetypes.ts:27`).
2. **Textura después.** `map` con una `KTX2`/`WebP` embebida como `data:` en un
   catálogo de fábrica de ocho acabados mexicanos (aplanado, ladrillo rojo
   recocido, cantera, madera de pino, concreto aparente, azulejo, teja,
   lámina). Escala por metro real, no por UV: `MATERIALMAP Escala 0.24` para un
   tabique. Esto NO exige biblioteca con dueño: las texturas se dibujan aquí,
   como ya se dibujaron los seis equipos de Plant y los ocho bloques de MEP.
3. **`RENDER` como un pase de mejora sobre el mismo WebGL**, no como un motor
   nuevo: acumulación temporal (TAA) mientras la cámara está quieta + SSAO +
   sombras suaves de varias muestras + `ACESFilmicToneMapping`. Cinco segundos
   parada y la imagen es de presentación. `RENDER Tamaño 3840x2160 Archivo` sale
   por el camino que `exportPng` ya tiene.
4. **Luces al final**, y sólo `POINTLIGHT`/`SPOTLIGHT` con posición e intensidad
   guardadas como entidades — es formato persistido y por tanto **decisión del
   titular**.
**Cómo se verifica:** spec de Node sobre la biblioteca (id desconocido → color
genérico, nunca excepción); golden que aplica `MATERIALATTACH MUROS Ladrillo` y
lee el color del material de la malla por la sonda; y para el render, un
artefacto versionado en `docs/cad/evidence/` con el tiempo hasta imagen asentada
y el hash de la imagen sobre una escena determinista.

---

### H-5 · El sol no sabe dónde está el edificio ni qué día es — ALTA

**AutoCAD:** `GEOGRAPHICLOCATION` fija latitud/longitud y zona horaria;
`SUNPROPERTIES` toma fecha y hora y calcula la posición REAL del sol;
`SUNSTATUS` lo enciende; el estudio de asoleamiento sale de ahí, y las sombras
del 21 de junio a las 12:00 son las del 21 de junio a las 12:00.

**Valle hoy:** dos deslizadores.

```ts
// apps/web/src/components/cad/editor/Layout3DEditor.tsx:1606
const [sun, setSun] = useState({ az: 35, el: 55 }); // sun azimuth/elevation (deg)
```

La interfaz está en `:15230-15265`: «Azimut» 0–360 y «Altura» **12–88**. Estado
de React, no persistido, no tecleable, sin comando, sin fecha, sin hora.

Y lo que más duele: **`GEOGRAPHICLOCATION` SÍ EXISTE** —
`command-manifest.ts:137`, con alias `GEO`, `GEOLOCATION`, `MAPCSASSIGN`,
`GEORREFERENCIAR`, e `commands/geo-location.ts` sabe la zona UTM y la
latitud/longitud del dibujo. El dato que hace falta está en el documento y nadie
lo conecta con el sol. Es el mismo defecto que la campaña de la Ola 3 encontró
tres veces («un subsistema entero escrito, probado y sin un cable»).

**El flujo que rompe:** el reglamento me pide justificar el asoleamiento del
patio. Aquí no puedo, y además la altura mínima de 12° me impide siquiera
simular un sol de invierno o un amanecer.

**Esfuerzo:** un día para el sol real; varios días con el estudio de sombras.
**Cómo se construye:** `lib/cad/sun-position.ts` PURO —algoritmo NOAA/Meeus,
son ~60 líneas: día juliano, anomalía media, declinación, ecuación del tiempo,
ángulo horario → azimut y elevación—; entra `{ latitud, longitud, fecha, hora,
husoHorario }` y sale `{ azimutDeg, elevacionDeg }`. La latitud sale del
marcador que ya deja `GEOGRAPHICLOCATION`. Comando `SUNPROPERTIES` que pide
fecha y hora (y acepta `Hoy`, `Solsticio`, `Equinoccio` como palabras clave, que
es lo que uno teclea de verdad). `applySun` deja de leer los deslizadores y lee
el resultado; los deslizadores quedan como el modo «a ojo» y se declara cuál
manda. El tope inferior de 12° se cae: un sol bajo es exactamente lo que hay que
poder ver, y la única razón del tope era que la sombra se va al infinito — se
resuelve con el tope de la cámara de sombras, no con el del sol.
**Cómo se verifica:** spec en Node contra la tabla publicada del NOAA para tres
ciudades mexicanas y cuatro fechas (±0,5° de tolerancia declarada). Es **el
único punto de esta dimensión donde hay un oráculo externo disponible sin
permiso de nadie**, lo cual vale doble en este repositorio.
**Ficheros:** `lib/cad/sun-position.ts` (nuevo), `lib/cad/engine/commands/`
(nuevo `view-sun.ts`), `components/cad/editor/Layout3DEditor.tsx:2162,15230`,
`lib/cad/engine/commands/geo-location.ts` (sólo leer).

---

### H-6 · La lámina no puede llevar una vista 3D — ALTA

**AutoCAD:** una ventana de presentación tiene su propia cámara, su propio
estilo visual y su propia sección viva, y se TRAZA así. Una lámina de
presentación con la perspectiva sombreada al lado de las plantas es rutina.

**Valle hoy:** cero, y está declarado. `docs/parity/ESCALERA.md:373`: *«Una
ventana de presentación que enseñe una cámara 3D | 0 | ninguna:
`viewportTransform` es una afín 2D»*. Todo lo que llega al papel pasa por
aplanar a líneas (`FLATSHOT`/`SOLPROF`/`SOLVIEW`).

**El flujo que rompe:** la lámina de entrega del anteproyecto. En AutoCAD pongo
cuatro ventanas: planta, dos alzados y una perspectiva conceptual. Aquí las tres
primeras sí; la cuarta no existe.

**Esfuerzo:** semanas.
**Cómo se construye:** un tercer tipo de ventana además de la afín 2D:
`CadPaperViewport3d { camera: { position, target, up, fov | orthoHeight },
visualStyleId, sectionPlane? }`. El trazado la resuelve rasterizando fuera de
pantalla (`WebGLRenderTarget` a la resolución del papel × DPI) y colocando la
imagen como XObject del PDF por el camino que `cadImagePlotPlacement` ya tiene.
La alternativa vectorial —proyectar las aristas visibles con el solucionador de
`hidden-line-solver.ts`, que ya existe y ya mide 130 ms sobre 400 sólidos— da un
PDF de LÍNEAS y es la que un despacho quiere para el corte; la raster es la que
quiere para la perspectiva. Las dos, con la elección declarada en la ventana.
**Cómo se verifica:** spec sobre los bytes del PDF (existe un XObject de imagen
con las dimensiones del recuadro / hay N segmentos de camino dentro del
recuadro), del mismo modo que `plot-shx-pdf.spec.ts` ya afirma sobre los bytes.
**Ficheros:** `lib/cad/layout/`, `lib/cad/plot/`,
`components/cad/editor/sheet-set-pdf.ts`. **Toca formato persistido: decisión
del titular.**

---

### H-7 · Hay dos sistemas de vistas guardadas y ninguno viaja con el dibujo — ALTA

**AutoCAD:** `VIEW` guarda EN EL DWG la cámara, el SCU, el estilo visual, el
estado de capas, la sección viva, el fondo y si es perspectiva o paralela. La
vista guardada llega al compañero con el archivo, y `VPORTS` la puede asignar a
una ventana.

**Valle hoy:** dos mecanismos distintos que no se hablan.

1. **`VIEW Guardar/Restituir/Borrar`** (`view-navigation.ts:359`) guarda un
   `CadNamedView` que es:
   ```ts
   // apps/web/src/lib/cad/view/view-navigation.ts:54-59
   export interface CadViewSnapshot {
     centerX: number; centerY: number;
     height: number;          // altura visible en unidades de DIBUJO
     twistDeg: number;
   }
   ```
   Cuatro números. **Ninguna cámara 3D.** Guardar una vista estando en órbita y
   restituirla devuelve un encuadre 2D. Y vive en memoria dentro de
   `CadNavigationHost` (`navigation-host.ts`, campo `namedViews`): se pierde al
   recargar.

2. **El menú «Vistas CAD»** (`Layout3DEditor.tsx:12356`,
   `saveCurrentViewportBookmark`) guarda un `CadViewportBookmark` con modo,
   posición y objetivo — la cámara 3D de verdad — en **`localStorage`**, con la
   clave `valle:cad:viewport-bookmarks:${model}:${revision}`
   (`Layout3DEditor.tsx:1731`). Es decir: por navegador, y **se pierde al
   cambiar de revisión**.

Ninguno de los dos guarda estilo visual, capas, SCU, sección ni sol.

**El flujo que rompe:** dejo montadas «CORTE A-A», «FACHADA NORTE» y «AÉREA
DESDE EL ACCESO», mando el archivo a mi socio, y él no ve ninguna. Y yo tampoco
al día siguiente si guardo una revisión nueva o abro desde otra máquina.

**Esfuerzo:** varios días.
**Cómo se construye:** UNA `CadNamedView` que unifique las dos, con la cámara 3D
opcional: `{ name, center2d, height, twistDeg, camera3d?: { position, target,
up, mode }, visualStyleId?, layerStateName?, ucsName?, sectionPlaneId? }`. `VIEW
Guardar` la escribe, el menú la lista, y las dos son la misma cosa. Persistirla
en el documento es **formato persistido: decisión del titular** —y es la
decisión correcta, porque una vista guardada que no viaja no es una vista
guardada. Mientras eso no se decida, el paso barato es que `VIEW` y el menú
compartan el `localStorage` y que la clave deje de llevar `revision`.
**Cómo se verifica:** golden que orbita, teclea `VIEW G FACHADA`, vuelve a
planta, teclea `VIEW R FACHADA` y afirma la pose de la cámara por la sonda; y un
spec que recarga la página y la vista sigue.
**Ficheros:** `lib/cad/view/view-navigation.ts`, `lib/cad/viewport-bookmarks.ts`,
`components/cad/command-line/navigation-host.ts`,
`components/cad/editor/Layout3DEditor.tsx:1731,12356`.

---

### H-8 · Faltan seis de los diez estilos visuales, y el que más se usa es uno de ellos — MEDIA

**AutoCAD 2027:** 2D alámbrico, Alámbrico, Oculto, **Conceptual**, **Realista**,
Sombreado, Sombreado con aristas, **Tonos de gris**, **Bosquejo**, **Rayos X**,
más el editor `VISUALSTYLES` para hacerse los suyos.

**Valle hoy:** cuatro (`visual-styles.ts:66-100`). Faltan los seis marcados. Y
`VISUALSTYLES` no existe (`grep -rl '"VISUALSTYLES"'` → cero), aunque **el patrón
de la cinta ya lo espera**: `ribbon.ts:180` tiene
`/^(-?VISUALSTYLES?|SHADEMODE|VSCURRENT)$/ → "Estilos visuales"`.

De los seis, dos hacen el trabajo de verdad:
- **Conceptual** (sombreado de Gooch, cálido/frío) es lo que un arquitecto pone
  para enseñar volumetría sin comprometerse con un material. Es el estilo que
  más se usa en una revisión de anteproyecto.
- **Rayos X** (caras semitransparentes + aristas) es como se revisa una
  interferencia: veo la estructura a través del acabado.

**Esfuerzo:** horas para Rayos X y Tonos de gris; un día para Conceptual.
**Cómo se construye:** la tabla ya es pura y ya tiene `opacity`. **Rayos X** son
tres campos: `faces: true, edges: true, opacity: 0.35` más
`depthWrite: false` y ordenación por distancia (o `transparent: true` con
`renderOrder`). **Tonos de gris** es el mismo Sombreado con el color desaturado.
**Conceptual** es un `ShaderMaterial` de veinte líneas: `mix(frío, cálido,
(N·L+1)/2)` con frío `#3b5c7a` y cálido `#d9c39a`, más las aristas de silueta que
`buildCadSolidVisibleEdges` ya sabe sacar. **Bosquejo** pide desplazamiento de
línea y sobrelargo (`overhang`) — es el más caro y el que menos importa.
**Cómo se verifica:** spec en Node sobre la tabla ampliada (cada estilo declara
sus cinco campos y `resolveCadVisualStyle` los resuelve por nombre con y sin
acento) + el golden 47 §3b ampliado a los diez nombres.
**Ficheros:** `lib/cad/view/visual-styles.ts`,
`lib/cad/engine/commands/view-visual.ts`, `lib/cad/solid3d-three.ts`.

---

### H-9 · No hay ventanas gráficas múltiples en el modelo (`VPORTS`) — MEDIA

**AutoCAD:** `VPORTS` parte el espacio modelo en 2, 3 o 4 ventanas, cada una con
su cámara y su estilo visual. La configuración clásica —planta arriba a la
izquierda, dos alzados y una isométrica— es cómo se modela en 3D.

**Valle hoy:** no existe. `VPORTS` no está en los 294 comandos, aunque —otra
vez— **la cinta ya reservó su panel**: `ribbon.ts:184`,
`/^(-?VPORTS?|MVIEW|MSPACE|PSPACE)$/ → "Ventanas"`. El golden 20
(`20-cad-multiple-viewports.spec.ts`) es de ventanas de PAPEL, no de modelo.

**El flujo que rompe:** modelar mirando sólo por un agujero. Cada vez que quiero
comprobar la altura de algo tengo que cambiar de vista y perder el encuadre.

**Esfuerzo:** semanas (es un cambio de arquitectura del visor: hoy hay UN
`renderer`, UNA cámara y UN `CadViewController`).
**Cómo se construye:** el camino barato en WebGL no es N canvas, es
`renderer.setScissorTest(true)` y N pasadas con `setViewport`/`setScissor` sobre
el MISMO `renderer` — una escena, N cámaras. Eso exige que
`CadViewController`, `CadSolidShadeHost` (que consulta la vista para las líneas
ocultas) y `plan-wheel-anchor` dejen de asumir una sola vista: pasa a haber una
ventana ACTIVA y el puntero decide cuál es por dónde cae. Es una ola entera.
**Cómo se verifica:** golden que teclea `VPORTS 4`, afirma cuatro rectángulos de
tijera con la sonda, teclea `VSCURRENT A` y comprueba que sólo cambia la activa.

---

### H-10 · El Recorrido no es tecleable, camina a la altura equivocada y no puede salir del solar — MEDIA

**AutoCAD:** `3DWALK` y `3DFLY` con `WALKFLYSETTINGS` (velocidad, altura de
paso, altura de ojo), la ventana de posicionador, colisión opcional, y `ANIPATH`
graba el recorrido a vídeo.

**Valle hoy:** existe (`Layout3DEditor.tsx:2523`, `toggleWalk`) y funciona: WASD
y mirar arrastrando. Pero:

1. **No es tecleable.** `3DWALK` y `3DFLY` no están en el manifiesto. Es un
   botón, y sólo un botón (`:14952`).
2. **La altura de ojo es proporcional al solar, no a una persona:**
   ```ts
   // apps/web/src/components/cad/editor/Layout3DEditor.tsx:2535 y :6426
   const eyeY = Math.max(ctx.W, ctx.H) * ctx.s * 0.06;
   ```
   Con `s = 30 / max(W,H)` eso son siempre 1,8 unidades de ESCENA, o sea
   `0,06 · max(W,H)` unidades de DIBUJO. En una nave de 40 m camino a **2,40 m**
   de altura; en una casa de 8 m de frente camino a **48 cm**, a gatas. Debería
   ser 1,70 m, siempre, en unidades del dibujo.
3. **No se puede salir del solar:**
   ```ts
   // apps/web/src/components/cad/editor/Layout3DEditor.tsx:7676-7679
   const lim = Math.max(W, H) * s * 0.62;
   camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
   camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));
   camera.position.y = eyeY;   // ← y por esto tampoco se puede VOLAR
   ```
   No puedo retroceder a la banqueta para mirar la fachada, que es exactamente
   el gesto que uno hace.
4. **No hay vuelo** (la `y` se fija cada cuadro), ni velocidad ajustable, ni
   subir/bajar, ni `ANIPATH`.

**Esfuerzo:** un día para los cuatro puntos, sin contar `ANIPATH`.
**Cómo se construye:** sacar el modo a `lib/cad/view/walk-mode.ts` como estado
puro `{ eyeHeightMm, speedMmPerSec, mode: "walk" | "fly", yaw, pitch, position }`
con su spec; altura de ojo por defecto 1.700 mm en unidades de dibujo
convertidas a escena (`1700 · s / mmPorUnidad`); el tope de posición pasa a ser
la envolvente del CONTENIDO inflada un 50 %, no la huella; `3DWALK`/`3DFLY` como
comandos con opciones `ALtura`, `VElocidad`; en `fly`, `Q`/`E` suben y bajan y la
`y` deja de fijarse.
**Cómo se verifica:** spec en Node sobre el módulo puro (la altura de ojo NO
depende de la huella: dos huellas distintas, misma altura en mm) + golden que
entra en Recorrido, camina veinte pasos hacia atrás y afirma que la cámara está
fuera de la huella.

---

### H-11 · El 3D es siempre perspectiva de 50°; no hay proyección paralela — MEDIA

**AutoCAD:** el 3D arranca en **paralela**. `PERSPECTIVE` la conmuta y `DVIEW`
da control fino de cámara y objetivo. Una isométrica de una pieza mecánica se
mira en paralela: las aristas paralelas se dibujan paralelas.

**Valle hoy:** `CadViewController.setMode` sólo aplica la ortográfica en modo
«2d» (`view-controller.ts:176-181`); en 3D siempre es la
`PerspectiveCamera(50, …)` (`Layout3DEditor.tsx:5985`). No hay variable
`PERSPECTIVE` ni comando `DVIEW`.

Irónicamente el repositorio ya escribió el argumento de por qué esto importa:
`lib/cad/view/perspective-distortion.spec.ts:24-31` explica que bajo perspectiva
«una entidad elevada está más cerca de la cámara y se dibuja MÁS GRANDE que otra
idéntica a cota cero», y por eso la vista 2D es ortográfica. En 3D ese mismo
argumento no se aplicó.

**Esfuerzo:** un día.
**Cómo se construye:** la ortográfica ya está construida
(`view-controller.ts:125`) y el controlador ya sabe conmutar. Sacar la elección
de proyección del MODO (2d/3d) a un eje propio: `setProjection("parallel" |
"perspective")` con `mode` intacto; la altura de la ortográfica sale de la
distancia y el FOV actuales para que la conmutación no dé salto. Comando
`PERSPECTIVE 0/1` y variable de sistema del mismo nombre en
`system-variables.ts`, que ya tiene el mecanismo.
**Cómo se verifica:** spec que proyecta dos rectas paralelas elevadas a cotas
distintas y afirma que su separación en pantalla es la misma en paralela —el
mismo instrumento que `perspective-distortion.spec.ts` ya usa para el 2D.

---

### H-12 · Sin transparencia de capa ni de objeto — MEDIA

**AutoCAD:** cada capa y cada objeto tienen transparencia 0–90. Es como se
apagan las referencias sin borrarlas, cómo se ve el terreno bajo la planta, y
la mitad de lo que hace útil el estilo Rayos X.

**Valle hoy:** el documento no tiene el campo. `grep -n "transparency\|opacity"`
sobre `cad-document.ts`, `cad-entities-v5.ts` y `cad-layer-*.ts` no devuelve
nada. `CadVisualStyle.opacity` existe pero es del ESTILO, no de la entidad, y
sólo lo lee `solid3d-three.ts:216`.

**Esfuerzo:** varios días. **Toca formato persistido: decisión del titular.**
**Cómo se construye:** `transparency?: number` (0–90, como DXF grupo 440) en
`CadLayer` y en `context.presentation`, resuelto por `cad-effective-style.ts`
que YA sabe hacer la herencia `BYLAYER`/`BYBLOCK` en un solo sitio (esa es
exactamente su razón de ser). El render 2D lo aplica al color del lote; el 3D al
`opacity` del material.
**Cómo se verifica:** el mismo camino que ya se usó para el color de capa en la
Ola de superación: el DXF de ida y vuelta con `ezdxf` como oráculo sobre el
grupo 440.

---

### H-13 · El enlace de revisión no enseña el modelo — MEDIA (y es la apuesta, §5)

**AutoCAD:** tampoco lo hace bien —comparte por Autodesk Viewer, con subida
aparte y cuenta— pero al menos el cliente ve el 3D.

**Valle hoy:** `/revision` (`app/revision/page.tsx`) monta `ReviewLinkClient`,
que importa `ReviewPlanView` y `projectCadPlan`
(`lib/cad/collab/plan-projection.ts`). La cabecera de ese módulo lo declara sin
ambigüedad: *«un lienzo vectorial que se dibuja con las mismas rutas de render
que el editor … le da eso sin WebGL»*. Trazos planos. El cliente recibe la
planta y **no puede ver el modelo**.

Está bien razonado para lo que resuelve (un móvil, sin cuenta, sin WebGL). Pero
deja sobre la mesa lo único que un CAD de navegador puede hacer y AutoCAD no.
Desarrollado en §5.

---

### H-14 · Cero evidencia de navegador para toda la navegación 3D tecleada — MEDIA

**Qué falta:** `grep -rn "VPOINT\|3DORBIT\|3DFORBIT\|3DZOOM\|3DPAN"
apps/web/e2e/` devuelve **cero**. Los cinco comandos se prueban sólo en Node,
contra módulos puros que no saben que existe OrbitControls. Del estilo visual hay
una única afirmación de navegador, y es sobre TEXTO de la línea de comandos
(golden 47 §3b, `"Estilo visual: Alámbrico."`), no sobre lo que cambió en la
escena.

Esto es la misma «regla 6» que este repositorio aplica con dureza al kernel WASM
(`wasm.toolchain`: «paridad numérica verde **Y enchufado**»). Aquí el módulo está
enchufado por un cable que un tercero —OrbitControls— corta cada cuadro (H-3), y
ninguna prueba lo ve.

**Esfuerzo:** un día.
**Cómo se construye:** una sonda de diagnóstico de cámara al lado de la que ya
usa el golden 85 (`Layout3DEditor.tsx:13659` ya publica `walkMode` en un
diagnóstico), publicando `position`, `target`, `up`, `fov` y `visualStyleId`.
Golden nuevo «mirar el modelo» con seis renglones `expect.soft`: las cuatro
vistas normalizadas, la inferior, la órbita tecleada, el estilo visual con
efecto medido y el estilo visual sobre un muro.
**Cómo se verifica:** él mismo. Y el artefacto va a `docs/cad/evidence/`, que hoy
no tiene ninguno de esta dimensión.

---

### H-15 · La niebla está clavada a la huella; un dibujo georreferenciado se ve NEGRO en 3D — MEDIA

**Valle hoy:**

```ts
// apps/web/src/components/cad/editor/Layout3DEditor.tsx:5978-5982
scene.fog = new THREE.Fog(0x0a0f1e,
  Math.max(W, H) * s * 1.4,      // near
  Math.max(W, H) * s * 3.4);     // far
```

Con `s = 30/max(W,H)`, eso es SIEMPRE `near = 42` y `far = 102` unidades de
escena, y **no se recalcula nunca** (`applyTheme` sólo le cambia el color,
`:2325`).

Ahora, el caso P0-3 que el propio repositorio documenta y para el que
`applyCadCameraViewPreset` tiene una rama entera (`camera-view-presets.ts:88`):
un dibujo georreferenciado cuyo contenido es DISJUNTO de la huella, a magnitud
UTM. Con una huella de 12.000 (`s = 0,0025`) y contenido de 2·10⁶ unidades, el
preset coloca la cámara a `d ≈ 5.000` unidades de escena del objetivo. Todo lo
que está más allá de 102 se pinta al 100 % del color de niebla, que es el color
de fondo. **El encuadre acierta y la pantalla sale vacía.**

Y aun en el caso normal: en la isométrica por defecto la cámara queda a ~43
unidades del objetivo, es decir el modelo entero vive dentro de la rampa 42→102
y el lado lejano del plano se desvanece hacia el fondo. Los colores que se ven no
son los del dibujo.

**Esfuerzo:** horas.
**Cómo se construye:** recalcular `fog.near`/`fog.far` en el mismo sitio donde se
recalcula el encuadre (`fitToBounds`, `applyCadCameraViewPreset`,
`applyViewMode`), a partir de la DISTANCIA de la cámara al objetivo y del radio
del contenido, no de la huella. Y una casilla «Profundidad atmosférica» que la
apague: un CAD técnico no debería tener niebla encendida por defecto en un
alzado.
**Cómo se verifica:** spec puro sobre la función que calcula near/far (contenido
2·10⁶ con huella 12.000 → `far` > distancia de cámara) + golden que abre el
documento UTM del golden 57 en 3D y afirma que el conteo de píxeles no-fondo del
lienzo es > 0.

---

## 4. Defectos de código

### 4.1 · Los tres constructores de geometría nativa invierten el giro de TODAS sus caras, y el material culea las de fuera

**Severidad: alta. Medido, no supuesto.**

Los tres módulos que llevan una malla B-rep a la escena aplican la misma
permutación de ejes:

```ts
// apps/web/src/lib/cad/solid3d-three.ts:146-149
positions[index * 3]     = (x - width / 2) * scale;
positions[index * 3 + 1] = z * scale;              // ← la z del dibujo es la altura
positions[index * 3 + 2] = (y - height / 2) * scale;
```

Idéntico en `lib/cad/room-solid-three.ts:48-50` y, con un marco de muro por
delante, en `lib/cad/wall-solid-three.ts:49-53` (`sceneFromLocal`).

Esa permutación `(x, y, z) → (x, z, y)` es una **transposición**: su determinante
es **−1**. Es una REFLEXIÓN, no una rotación. Y los índices se copian tal cual
(`geometry.setIndex(Array.from(mesh.indices))`, los tres módulos), así que **el
giro de cada triángulo se invierte**.

Lo medí sobre el kernel real (`npx tsx`, `extrudeProfile` de 1000×600×500 →
`tessellateBody`, comparando `cross(b−a, c−a) · normal` triángulo a triángulo):

```
MALLA B-rep cruda    triángulos con giro CONCORDE a su normal: 12 | DISCORDE: 0
TRAS el mapeo escena triángulos con giro CONCORDE a su normal:  0 | DISCORDE: 12
```

Doce de doce. Y los tres materiales declaran cara frontal:

- `lib/cad/solid3d-three.ts:219` — `side: THREE.FrontSide`
- `lib/cad/wall-solid-three.ts:214` — `side: THREE.FrontSide`
- `lib/cad/room-solid-three.ts:101` — `side: THREE.FrontSide`

THREE compensa una reflexión sólo si viene en la MATRIZ del objeto:

```js
// three 0.185.1, build/three.module.js:17182
const frontFaceCW = ( object.isMesh && object.matrixWorld.determinantAffine() < 0 );
...
// :10401-10403
let flipSided = ( material.side === BackSide );
if ( frontFaceCW ) flipSided = ! flipSided;
```

Aquí la reflexión está **horneada en los vértices**, no en la matriz: el
`matrixWorld` de la malla tiene determinante +1 y `frontFaceCW` es `false`. Por
tanto WebGL **descarta las caras exteriores y dibuja las interiores**.

**Qué ve el usuario, y por qué nadie lo ha cazado:**
- La silueta es exactamente la misma (es un cuerpo cerrado). Por eso pasa
  desapercibido.
- El fragmento que gana el búfer de profundidad es la superficie LEJANA, no la
  cercana. Dos sólidos que se solapan se ordenan mal entre sí, y el
  `polygonOffset` de `solid3d-three.ts:220-222` —que existe para que las aristas
  no parpadeen contra su propia malla— está empujando la superficie equivocada.
- La normal interpolada de ese fragmento apunta AL CONTRARIO de la cámara, y
  `MeshLambertMaterial` con `FrontSide` no la voltea. El término difuso de la
  direccional se anula sobre casi toda la pieza, así que el modelo queda
  iluminado prácticamente sólo por la ambiente (0,55) y la hemisférica (0,5).
  Traducido: **mover el sol casi no cambia cómo se ven las superficies.** Eso
  encaja con que la única interfaz del sol sean dos deslizadores que «no se nota
  mucho que hagan».
- El mapa de sombras usa `shadowSide`, que por defecto invierte el `side`, así
  que las sombras proyectadas sobre el suelo salen razonables — otra razón por
  la que el defecto se disfraza.
- Los arquetipos HEREDADOS (`asset-archetypes.ts`) usan geometría de THREE
  (`BoxGeometry` y compañía) sin permutar, y esos **sí se ven bien**. O sea: la
  demo con muebles se ve correcta y el modelo nativo del arquitecto no. El
  defecto está exactamente donde nadie mira.

**Arreglo:** en los tres constructores, invertir el orden de cada triángulo al
copiar los índices (`push(c, b, a)`), que es una línea por módulo y no toca ni
posiciones ni normales. Alternativa igual de válida: dejar de reflejar —usar
`(x, y, z) → (x, z, −y)`, que es una rotación de determinante +1— pero eso
cambia el sentido del norte en escena y arrastra a `entity-three.ts`,
`camera-view-presets.ts` y `plan-wheel-anchor.ts`, así que no.
**Prueba que lo guarda:** exactamente la medición de arriba, como spec de Node
en `lib/cad/solid3d-three.spec.ts` y sus dos hermanos: para cada triángulo de la
malla de escena, `cross(b−a, c−a) · normal(a) > 0`. Cero triángulos discordes.

---

### 4.2 · `maxPolarAngle` deshace en el cuadro siguiente cinco de las diez vistas normalizadas

**Severidad: alta.** Detallado en H-3.
`components/cad/viewport/camera-policy.ts:145` contra
`lib/cad/view/view-3d.ts:186-222` y `Layout3DEditor.tsx:7687`.
Frontal, Posterior, Izquierda y Derecha (φ=90°) e Inferior (φ=180°) se recolocan
a 87,8°. La tabla de vistas es correcta; el visor la desobedece en silencio.

---

### 4.3 · El giro (`roll`) de `3DFORBIT` no sobrevive un cuadro

**Severidad: media.** `view-controller.ts:285` (`orbitFreePerspective`) escribe
un `up` inclinado y llama a `lookAt`. En el cuadro siguiente
`controls.update()` recalcula el esférico en el espacio «Y-arriba» usando
`this._quat`, que OrbitControls fijó UNA vez en su constructor
(`OrbitControls.js:406`) a partir del `up` de entonces —`(0,1,0)`— y no vuelve a
actualizar nunca, y después hace `this.object.lookAt(this.target)`
(`:788`). La órbita libre, que es la razón de ser de `3DFORBIT` frente a
`3DORBIT`, queda mezclada con un marco que ya no es el suyo.

**Arreglo:** mismo que 4.2 — mientras la vista la manda un comando, el
controlador manda; `controls` se resincroniza después (copiar `up`, recalcular
`_quat` con `controls.object.up` o reconstruir los controles) en vez de correr en
paralelo. **Prueba:** golden que teclea `3DFORBIT 0 0` con `rollDeg` y afirma que
`camera.up` sigue inclinado dos cuadros después.

---

### 4.4 · `VSCURRENT` contesta con éxito aunque no haya cambiado nada

**Severidad: media.** `solid-shade-host.ts:283-301`:

```ts
setStyle(style: CadVisualStyleId): CadVisualStyleId {
  if (style === this.style) return this.style;   // ← sale sin hacer nada
  ...
}
applyVisualStyle(style: CadVisualStyleId): string {
  return cadVisualStyle(this.setStyle(style)).label;   // ← devuelve la etiqueta igual
}
```

Sobre un documento sin un solo `solid3d` —o sea la planta de cualquier
arquitecto (H-1)— la orden responde «Estilo visual: Sombreado.» y en la escena no
hay ninguna malla que sombrear. Es un éxito falso, del tipo exacto que
`command-integrity.json` y la fila `integrity.commands` existen para impedir.

**Arreglo:** que `applyVisualStyle` devuelva `{ label, changed }` con el conteo
de objetos reconstruidos, y que el renglón diga «Estilo visual: Sombreado (0
objetos: este dibujo no tiene sólidos sombreables)». **Prueba:** entrada nueva en
el arnés de veracidad de `check:cad`.

---

### 4.5 · La altura de ojo del Recorrido depende del tamaño del solar

**Severidad: media.** `Layout3DEditor.tsx:2535` y `:6426`,
`eyeY = Math.max(ctx.W, ctx.H) * ctx.s * 0.06`. Detallado en H-10: 2,40 m en una
nave de 40 m, 48 cm en una casa de 8 m. Un recorrido a pie con la altura de ojo
mal es un recorrido que engaña sobre lo que se ve por una ventana, que es
justamente para lo que se usa.

---

### 4.6 · El Recorrido no puede salir de la huella y no puede volar

**Severidad: media.** `Layout3DEditor.tsx:7676-7679`. `lim = max(W,H)·s·0.62`
encierra al usuario dentro del solar, y `camera.position.y = eyeY` cada cuadro
mata cualquier posibilidad de `3DFLY`.

---

### 4.7 · La niebla y la cámara de sombras están clavadas a la huella

**Severidad: media.** `Layout3DEditor.tsx:5978-5982` (niebla) y `:6028-6034`
(`sh = Math.max(W, H) * s`, el volumen de la cámara de sombras). Ninguna de las
dos se recalcula cuando el encuadre se va al CONTENIDO —la rama que
`camera-view-presets.ts:88` tiene expresamente para el caso georreferenciado—.
Consecuencias en H-15; para las sombras, el contenido fuera del volumen
simplemente no proyecta ni recibe.

---

### 4.8 · Deuda ya conocida que toca a esta dimensión

`docs/execution/BACKLOG.md`, **P2-14**: `wall-solid-host.ts:153`,
`room-solid-host.ts:74`, `solid-shade-host.ts:322` y `solid-snap-host.ts:110`
recorren `document.entities` sin filtrar por `document.modelSpace.entityIds`
—sólo el pipeline 2D lo hace—, así que el día que anotar directo sobre una hoja
se cablee, esa nota aparecerá flotando en la vista 3D. El backlog lo declara
latente y da el criterio de aceptación. Lo confirmo leyendo los cuatro: sigue
siendo verdad.

---

## 5. La apuesta ganadora

> **El enlace de revisión que abre el MODELO —sombreado, seccionado y con el sol
> del día real— en el teléfono del cliente, sin instalar nada, sin cuenta, sin
> licencia, y con los comentarios anclados a un punto del 3D.**

No es la que falta: es la que GANA. Y hay que verla desde lo que un CAD de
navegador puede y AutoCAD estructuralmente no.

**Por qué AutoCAD no puede.** Su render vive en el escritorio del que tiene la
licencia. Para que el cliente vea algo hay que exportar una imagen y mandarla
por correo (y entonces el cliente comenta sobre un JPG, y yo tengo que traducir
«esa esquina» a una coordenada), o subirlo a Autodesk Viewer, que pide subida
aparte, cuenta y una versión del archivo que a partir de ese momento diverge de
la mía. En los dos casos, entre lo que yo tengo abierto y lo que el cliente mira
hay un archivo intermedio. Y un DWG no se abre en un teléfono.

**Por qué Valle sí puede, y casi puede ya.** Las cuatro piezas caras están
construidas y probadas:

1. **La puerta sin cuenta, con el token en el fragmento.** `app/revision/page.tsx`
   —el token va en `#cadReview=…`, no en la ruta, para que no quede en el log ni
   en el `Referer`; la ruta es estática e idéntica para todo el mundo. Está
   razonado y hecho.
2. **Los comentarios anclados a la GEOMETRÍA**, no a un píxel
   (`use-cad-comments.ts`, `CollabThreadPanel`, fila `review` de la rúbrica 4/5
   con «spec de anclaje»).
3. **La presencia en vivo** (`use-cad-presence.ts`, `collab-overlay.ts`,
   `live-cursor.ts`): dos personas mirando lo mismo a la vez.
4. **La escena 3D entera**, con sus muros, huecos, losas y cubiertas
   (`CadNativeMassHosts`), su sol con sombras y su exportación GLB — que ya
   demuestra que la geometría comercial está toda en un grupo y sabe salir.

Lo único que falta es **dejar pasar el 3D por esa puerta**. Hoy no pasa por una
decisión explícita y bien argumentada (`plan-projection.ts:5-13`: el estudio son
22.000 líneas y pide sesión, el cliente viene de un móvil). El argumento es
correcto **para el estudio**. No lo es para un visor de sólo lectura: la escena
3D no necesita el motor de comandos, ni el osnap, ni la historia, ni el CAS —
necesita `three`, las mallas y una cámara. Eso son unos cientos de kilobytes con
`import()` diferido, el mismo reparto que `lazy-commands.ts` ya usa para no
mandar 291 implementaciones al primer chunk.

### Cómo se construye, en tres olas

**Ola A — el modelo llega (varios días).**
Un `Cad3dReviewScene` que reciba el `CadDocument` que el enlace ya trae y monte
sólo `CadNativeMassHosts` + `CadSolidShadeHost` + el plató de luz. Sin edición,
sin puntero de comandos, sin `Layout3DEditor`. Un conmutador Plano / Modelo en
la barra: el 2D que ya está sigue siendo el camino sin WebGL, y el 3D es una
mejora que se ofrece cuando el navegador lo permite (`webgl-context-guard.ts` ya
sabe detectarlo y degradar con telón). Órbita con un dedo, pellizco para acercar,
el ViewCube en la esquina. Depende de: **H-1** (que el estilo alcance a los
muros) y **4.1** (que las caras se vean por fuera).

**Ola B — el comentario se ancla en el espacio (varios días).**
El cliente toca una pared y el comentario se guarda con un punto 3D y la
dirección de mirada. Cuando lo abro en el estudio, la cámara VA a ese punto con
esa mirada. El anclaje 2D ya existe y la infraestructura de hilos también: es
ensanchar el ancla de `CadPoint2` a `CadPoint3` + `viewDir`. Esto es lo que
convierte «no me gusta ese chaflán» en una coordenada.

**Ola C — el sol y el corte, del lado del cliente (varios días).**
Un deslizador de HORA sobre el sol real (**H-5**) y un plano de corte que el
cliente arrastra (**H-2**). Con esto el enlace deja de ser una foto y pasa a ser
lo que ningún despacho puede dar hoy: *«toma, aquí está tu casa; muévela, ábrela
por donde quieras y mira cómo le da el sol el 21 de diciembre a las cinco de la
tarde — y si algo no te gusta, tócalo y escríbeme ahí»*.

### Cómo se verifica

Golden con un contexto de navegador **sin sesión**: abre `/revision#…`, conmuta a
Modelo, afirma `data-mesh-count > 0` en el diagnóstico (que ya existe y ya cuenta
la escena REAL, no botones), orbita, toca un muro, deja un comentario, y una
segunda página con sesión abre el estudio y comprueba que la cámara aterrizó en
ese punto. Y el presupuesto de descarga se mide contra
`e2e/performance/frontend-load-budget.spec.ts`, que ya existe y cuyo techo sólo
baja: el 3D del visor de revisión entra por `import()` diferido o no entra.

### Por qué esto y no el render

Porque el render fotorrealista es una carrera que Valle no puede ganar contra
Enscape ni contra Twinmotion, y que además el cliente no pide: el cliente pide
**entender**. Y porque esta apuesta usa la única ventaja estructural que tiene
correr en el navegador —el reparto por URL— sobre unos cimientos que este
repositorio ya pagó. AutoCAD tiene diez estilos visuales y un motor de render, y
sigue sin poder mandarle a nadie un enlace que se abra en un teléfono y devuelva
un comentario anclado a un muro.

---

## 6. Resumen ejecutivo

| # | Hueco | Severidad | Esfuerzo |
| --- | --- | --- | --- |
| H-1 | El estilo visual sólo alcanza a `solid3d` | bloqueante | varios días |
| H-2 | No hay corte vivo (`SECTIONPLANE`/`LIVESECTION`) | bloqueante | varios días |
| H-3 | Los cuatro alzados y la vista inferior se recolocan solos | alta | un día |
| H-4 | Sin render, sin materiales, sin luces | alta | semanas |
| H-5 | El sol no sabe dónde ni cuándo | alta | un día |
| H-6 | La lámina no lleva vista 3D | alta | semanas |
| H-7 | Dos sistemas de vistas guardadas, ninguno viaja | alta | varios días |
| H-8 | Faltan seis de los diez estilos visuales | media | un día |
| H-9 | Sin `VPORTS` en el modelo | media | semanas |
| H-10 | El Recorrido: sin teclear, mala altura, encerrado | media | un día |
| H-11 | Siempre perspectiva; sin proyección paralela | media | un día |
| H-12 | Sin transparencia de capa ni de objeto | media | varios días |
| H-13 | El enlace de revisión no enseña el modelo | media | varios días |
| H-14 | Cero evidencia de navegador de la navegación 3D | media | un día |
| H-15 | Niebla clavada a la huella: el UTM sale negro | media | horas |

**Lo primero que haría, en este orden:** 4.1 (las caras del revés, horas), H-3
(los alzados, un día), H-1 (el estilo llega a los muros, varios días), H-5 (el
sol real, un día), H-2 (el corte vivo, varios días). Con esos cinco, esta
dimensión pasa de 3 a un 6 honesto, y la apuesta de §5 queda a tiro.

**Y una petición al titular:** que la rúbrica gane una fila. No para inflar el
denominador, sino porque hoy sus 36 filas no pueden distinguir un producto que
enseña el modelo de uno que no, y eso es lo primero que un arquitecto mira.
