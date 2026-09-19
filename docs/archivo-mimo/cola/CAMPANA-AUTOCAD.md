# CAMPANA AUTOCAD — cobertura 3D y entregables, ficha por ficha (16-sep-2026)

Esta lista existe para que NUNCA te quedes sin trabajo de valor. Se recorre DESPUES de
`CAMPANA-PREMIUM.md`, `tareas/INDICE.md` y `CAMPANA-3D.md`. Una ficha por sesion, un commit por
ficha. **Cada ficha termina con un spec que EJECUTA el comando real contra el motor real y
comprueba geometria o comportamiento** (nunca un spec que se prueba a si mismo ni un grep del fuente).
Antes de empezar una ficha: `grep -rn "<COMANDO>" apps/web/src/lib/cad/engine/command-manifest.ts`
— si ya existe, comprueba que FUNCIONA (conducelo con el arnes de `solview-commands.spec.ts`);
si funciona, marca la ficha como «ya existia» en la bitacora y pasa a la siguiente. Nada de redundancia.

Medido el 16-sep contra el manifiesto (301 comandos): Solidos 23/23, Visualizacion 10/20,
Transformar-3D 3/8, Superficies 0/14, Render 1/13, Mallas 0/15, VIEWBASE-familia 0/6 (pero
SOLVIEW/SOLDRAW existen y funcionan). Prioridad = lo que un ARQUITECTO usa en su primer dia.

## A · Documentacion desde el modelo (la tesis) — nombres de AutoCAD sobre SOLVIEW/SOLDRAW
- A1 `VIEWBASE`: alias/comando que crea la vista base de un solido en una lamina, delegando en SOLVIEW. Spec: desde un solid3d, VIEWBASE produce la vista con trazos VIS/HID en la lamina.
- A2 `VIEWPROJ`: vista proyectada (alzado lateral, posterior, isometrica) alineada con la base. Spec: 4 vistas alineadas, misma escala, origenes coherentes.
- A3 `VIEWSECTION`: corte con plano y sombreado, delegando en SLICE/SECTION + SOLDRAW. Spec: mover un muro cambia el corte.
- A4 `VIEWDETAIL`: detalle ampliado circular con escala propia. Spec: escala del detalle = 2x la vista madre.
- A5 `VIEWEDIT`: cambiar escala/estilo de una vista existente sin recrearla (identidad estable, ver C01). Spec: la cota asociada sobrevive.
- A6 `VIEWUPDATE`: regenerar todas las vistas obsoletas de la lamina. Spec: N vistas marcadas obsoletas → 0 tras VIEWUPDATE.
- A7 Acotacion automatica de la planta derivada (muros exteriores, huecos). Spec: cotas asociativas creadas = numero de tramos.

## B · Visualizacion 3D que falta (10 de 20)
- B1 `3DWALK`/`3DFLY`: recorrido con teclado dentro del modelo. Spec: la camara avanza 1 m por pulsacion.
- B2 `3DSWIVEL`/`3DPAN`/`3DZOOM` como comandos tecleables (hoy solo raton). Spec: cada uno cambia la camara de forma verificable.
- B3 `VPOINT` y `PLAN`: punto de vista por vector y volver a planta del UCS actual. Spec: matriz de camara esperada.
- B4 `NAVVCUBE` real: el cubo de vistas con caras, aristas y vertices pulsables y «Inicio». Spec: pulsar cara Frente = vista frontal exacta.
- B5 `NAVBAR`: barra de navegacion acoplada (orbita, encuadre, zoom, recorrido). Spec: presente, ordenada, sin solapar el lienzo.
- B6 `VISUALSTYLES` con render REAL: Alambre, Oculto, Sombreado, Sombreado con aristas, Realista, Conceptual. Cada estilo debe pintar distinto (medir pixeles en un golden). Sin estilos que no pintan.
- B7 `CAMERA` guardada y `VIEW` con nombre: crear, listar, restaurar. Spec: restaurar devuelve la misma matriz.
- B8 `CLIP`/`SECTIONPLANE` vivo: plano de corte interactivo en el visor, con relleno. Spec: entidades detras del plano no se dibujan.
- B9 `SHADEMODE`/`REGEN3D`: alias y regeneracion. Spec: alias resuelto.
- B10 Sombras y sol basicos (`SUNPROPERTIES` minimo: fecha/hora/norte). Spec: la sombra de un muro cambia con la hora.

## C · Transformar en 3D (5 de 8)
- C1 `3DSCALE` con eje/plano. C2 `3DALIGN` (tres puntos origen → destino). C3 `MIRROR3D` (plano por 3 puntos, XY/YZ/ZX). C4 `3DARRAY` (rectangular con niveles, polar con eje). C5 `ALIGN` 2D/3D unificado. C6 `ROTATE3D` → alias de 3DROTATE. Spec de cada uno: `solid3dMassProperties` (centroide y volumen) antes y despues, con el valor cerrado esperado.

## D · Superficies que SI usa un arquitecto (el kernel ya tiene NURBS en brep/nurbs.ts)
- D1 `PLANESURF`: superficie plana por rectangulo o por objetos. D2 `EXTRUDE` de curva a superficie (cubierta inclinada). D3 `LOFT` entre secciones para cubiertas curvas. D4 `SURFOFFSET` (espesor de losa curva). D5 `SURFTRIM`/`SURFEXTEND` con otra superficie. D6 `THICKEN`: superficie → solido con espesor (ES el puente a lo que ya existe). D7 `CONVTOSOLID`/`CONVTOSURFACE`. Spec: area/volumen medidos con tolerancia de cuerda declarada. (Mallas: SOLO `MESH` primitivas y `CONVTOSOLID`; el resto es diseno industrial y NO se hace.)

## E · Entregables (lo que el cliente abre)
- E1 DXF exporta solidos 3D (hoy: CERO entidades de un solido) — como malla facetada `3DFACE`/`POLYFACE` o `ACIS` declarado como perdida explicita. E2 DXF escribe presentaciones (LAYOUT, *Paper_Space, VIEWPORT). E3 STEP/IGES escriben la unidad del dibujo. E4 PDF declara los caracteres que no puede escribir. E5 `ETRANSMIT`: zip con DXF + PDF + fuentes + xrefs. E6 `PUBLISH` por lotes de laminas a un PDF multipagina. E7 `PAGESETUP` con nombre y `PLOTSTYLE` (ctb minimo: espesor por color).

## F · Confianza (sin esto nadie usa el 3D dos veces)
- F1 UNDO/REDO cubre TODA operacion 3D (booleanas incluidas), spec por comando. F2 Guardar y recargar conserva solidos con historial. F3 Booleana que falla no corrompe el documento (transaccion). F4 Presupuesto de rendimiento: golden con N solidos y fps minimo declarado. F5 Mensajes de error del kernel en espanol y con causa.

## REGLA FINAL
Cuando esta lista se acabe, vuelve a medir la cobertura contra `command-manifest.ts` con la tabla de
arriba, anota los numeros nuevos en la bitacora y elige la siguiente capacidad por VALOR PARA UN
ARQUITECTO. Nunca declares la mision terminada. Nunca hagas relleno.
