# CRITICA DE LA DEMO EN PRODUCCION (supervisor, 18-sep 23:30) — FRENTE 4, DESPUES DEL MERGE

Sergio abrio vallecad.com/demo y dijo: «se ve muy feo, no se siente en lo absoluto como AutoCAD».
El supervisor la abrio en Chrome y lo confirma. Esto es lo que ve un usuario de AutoCAD, en orden de
cuanto le duele. **Produccion es `main` de hace dos dias**: antes de tocar cada punto, abre TU rama en
local (`npm run dev --workspace=web`, http://localhost:3000/demo) y comprueba si ya lo arreglaste. Si ya
esta, anotalo como «hecho en la rama» y pasa al siguiente. Uno por commit, con su golden.

## V1 · EL DIBUJO NO SE VE (lo peor, y lo primero que se mira)
En la casa de la demo, en 2D, la mitad de las lineas son BLANCAS sobre el lienzo claro: la planta parece
un contorno roto. AutoCAD pinta el color 7 (blanco) en NEGRO cuando el fondo es claro, y en blanco cuando
es oscuro. Tu T4 lo hizo para PLOT; falta en PANTALLA. Regla: el color 7 / #ffffff se resuelve contra el
fondo del lienzo, siempre. Golden: con fondo claro, ningun trazo del dibujo se pinta con contraste < 3:1.

## V2 · LOS TEXTOS NO SE VEN EN 2D
El panel derecho lista 13 textos («Texto 1…13») y en el lienzo 2D no aparece NINGUNO, ni las cotas, ni el
arco de la puerta. Era la sospecha S1 de la auditoria: confirmada en produccion. En 3D si salen.

**Acotado por el supervisor (23:55), no repitas esto:** NO es el color (tampoco salen sobre fondo oscuro) y NO
es el tamano (con zoom de 20 pasos sobre un local no aparece ninguno). En 3D si salen porque van por otro camino
(scene-objects.ts, sprites con fillText). En 2D el texto va por text-requests.ts -> text-atlas-three.ts dentro del
pipeline (y pipeline-offthread.ts). La consola no da ningun error. Sospechas, en este orden: (1) el atlas se
construye en un worker/OffscreenCanvas donde la fuente web no esta cargada y dibuja glifos vacios; (2) el pipeline
excluye las entidades de solo texto (cadEntityIsTextOnly) y nadie las vuelve a pintar; (3) los quads salen con alfa
0. Reproduce en TU arbol con npm run dev (Turbopack funciona ahi) en /demo y deja un golden que exija que al menos
un rotulo de local sea visible en 2D.

**Medido en produccion por el supervisor (19-sep 02:20), esto CAMBIA el diagnostico:** en /demo el nodo
`[data-testid=cad-render-pipeline]` dice, tras mover la vista, `data-total=22 data-glyphs=88 data-dropped-glyphs=0`:
**el atlas SI rasteriza los 88 glifos** y el pipeline SI tiene las 22 entidades. Y en pantalla no sale ni una letra,
ni con zoom +20 ni con zoom -16. O sea: el texto se DIBUJA pero no se VE (posicion fuera de vista por el signo de Y
—la auditoria ya vio la planta espejada, cad-view.ts:65-70—, alfa 0, profundidad detras de la lamina, o tamano).
**El golden 47 solo exige data-glyphs >= 56, no que el texto sea visible:** por eso todo pasa en verde. Ademas, al
cargar la demo el pipeline marca total=0 hasta el primer cambio de vista. Arreglo con golden que lea pixeles (o el
recuadro en pantalla de al menos un rotulo) y exija que caiga DENTRO del lienzo.

## V3 · EN 3D LOS ROTULOS SON UNA MONTANA ILEGIBLE
Al pulsar 3D, decenas de rotulos flotan encimados («RECAMARA PRINCIPAL», «Patin de bombeo», «Refrigerador»,
frases sueltas como «estructural son objetos expl…») tapando el edificio. AutoCAD no pinta el texto de la
planta como carteles flotantes. Minimo: rotulos de local solo, sin encimarse (ocultar el que choca), y
nada de etiquetas de equipos de otras plantillas en la casa.

## V4 · LA CINTA NO PARECE AUTOCAD
En produccion: una sola fila de 20 iconos iguales con el nombre en ingles (PLINE, RECTANG, XLINE) bajo un
unico panel «Dibujo», cortada por la derecha, y ademas arranca PLEGADA (solo pestanas con contadores
«Inicio 159»). Tu rama ya trae paneles en 3 filas y rotulos en espanol: verificalo. Quita los contadores
de las pestanas (AutoCAD no los tiene) y que la cinta arranque DESPLEGADA.

## V5 · LA PALETA PARTE LAS PALABRAS
«Seleccio nar», «Encuadr e», «Distanci a», «Rectang ulo». Es D09 de tareas/INDICE.md.

## V6 · COSAS FLOTANDO ENCIMA DE OTRAS
«Algo salio mal» y «Comentarios» flotan tapando la Biblioteca (D10). El recorrido «Primeros cinco minutos»
tapa un tercio del dibujo al abrir (D12). La pildora de ayuda tapa la linea de comandos (D11).

## V7 · LO QUE HACE QUE SE SIENTA WEB Y NO CAD
- Lienzo claro por defecto: AutoCAD abre en oscuro. La MISION ya lo pide (Fase 3, «Tema»).
- La linea de comandos es una cajita de una linea: en AutoCAD es una barra acoplada de ancho completo con
  historial de 3 lineas visible.
- Pestanas Modelo/Layout arriba; en AutoCAD van abajo, junto a la barra de estado.
- La barra de estado ensena datos de desarrollo: «demo-local · demo · v2 Release Sin validar». Fuera.
- El panel derecho mezcla idiomas y mayusculas: «Text» / «TEXTO», capas «architecture», «equipment».
- Sin cursor en cruz ni icono SCU en 2D; coordenadas «X – · Y –» hasta mover el raton.
