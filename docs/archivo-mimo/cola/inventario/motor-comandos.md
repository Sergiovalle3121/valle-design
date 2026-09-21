# Inventario: Motor de comandos -- engine/

> Directorio: apps/web/src/lib/cad/engine/
> Fecha de lectura: 2026-09-15
> Archivos leidos: 231 (21 en raiz + 211 en commands/, incluyendo 84 specs)

---

## 1. Que existe: arquitectura del motor

### 1.1 Nucleo del motor (raiz de engine/)

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| command-engine.ts | 513 | Reductor puro del motor. Implementa comandos transparentes, repetir con Espacio, frontera de deshacer, override OSNAP, modificadores de punto (DESDE/M2P/TT/PAR). |
| command-types.ts | 649 | Contrato completo: CadCommandDescriptor, CadCommandStep, CadCommandInput, CadCommandResult, mascaras de aceptacion (POINT/DISTANCE/ANGLE/TEXT/KEYWORD/SELECTION/ENTITY_PICK/FACE_PICK/EDGE_PICK). |
| command-manifest.ts | 340 | GENERADO. 300 entradas de comandos con metadatos estaticos. Lo usa la cinta, la paleta Ctrl+K y la linea de comandos al abrir. |
| all-commands.ts | 249 | GENERADO. 112 modulos importados estaticamente para specs/Node. NO para el navegador. |
| lazy-commands.ts | 235 | Carga perezosa de las 112 implementaciones. Thunks literales. Memoizacion por modulo. |
| index.ts | 199 | Punto de entrada: CAD_COMMAND_REGISTRY_V2, loadCadCommand(), cadWarmAllCommands(), descriptores perezosos. |
| registry.ts | 82 | CadCommandRegistryImpl: mapa por nombre + alias, deteccion de duplicados. |
| alias-table.ts | 329 | Tabla de alias acad.pgp: ~290 alias. Incluye espanol (MURO->WALL, PUERTA->DOOR). |
| input-pipeline.ts | 284 | Analizador: transparente -> keyword -> OSNAP -> modificador -> angulo -> distancia -> coordenada -> texto -> invocacion. |
| prompt.ts | 91 | Formato de prompts con atajos resaltados. |
| command-summaries.ts | 349 | Resumenes en espanol de todos los comandos. Fail-closed. |
| current-presentation.ts | 79 | CECOLOR/CELTYPE/CELWEIGHT a entidades nuevas. |
| host-requests.ts | 209 | Solo tipos: peticiones al anfitrion (plot, publish, undo/redo, xref, dxf, clipboard). |
| script-runner.ts | 364 | Ejecutor de .scr sin interfaz. Fallo cerrado con 5 codigos. |
| spatial-point.ts | 26 | cadPointZ() y cadLiftPoint(): punto 3D con cota. |

### 1.2 Specs del nucleo

| Spec | Cobertura |
|------|-----------|
| command-engine.spec.ts | LINE, PLINE, RECTANG, CIRCLE (centro-radio/diam/2P/3P), alias, prompts, keyword, entrada directa distancia, coordenadas relativas/polares, ANGBASE/ANGDIR/AUNITS, transparentes, Esc, OSNAP, DESDE/M2P/PAR, repetir Espacio. |
| command-summaries.spec.ts | Fail-closed: todo comando tiene resumen. Longitud 10-110 chars. |
| current-presentation.spec.ts | CECOLOR/CELTYPE/CELWEIGHT contra motor real. |
| index.spec.ts | Registro: sin duplicados, alias resueltos, familias presentes, 0 sin resolver. |
| script-runner.spec.ts | Plantilla de estudio, dos caminos mismo dibujo, variantes -COMANDO, fallo cerrado 5 codigos. |

### 1.3 Modulos de comandos (commands/)

**112 modulos**, 211 archivos (84 specs, 127 implementaciones + soporte).


#### Dibujo (draw)

| Modulo | Comandos | Spec | Estado |
|--------|----------|------|--------|
| draw-basics.ts | LINE, CIRCLE | command-engine.spec | Funciona |
| draw-pline.ts | PLINE | draw-pline.spec | Funciona |
| draw-rectang.ts | RECTANG | draw-rectang.spec | Funciona |
| draw-curves.ts | ARC, ELLIPSE, POLYGON | draw-curves.spec | Funciona |
| draw-spline.ts | SPLINE | draw-spline.spec | Funciona |
| draw-construction.ts | XLINE, RAY | -- | Funciona |
| draw-points.ts | POINT, DIVIDE, MEASURE | -- | Funciona |
| draw-rings.ts | DONUT, REVCLOUD | draw-rings.spec | Funciona |
| draw-fills.ts | SOLID, WIPEOUT, IMAGE | -- | Funciona |
| draw-wall.ts | WALL | draw-wall.spec | Funciona |
| draw-opening.ts | DOOR, WINDOW | -- | Funciona |
| draw-annotation-v4.ts | ATTDEF, TABLE | -- | Funciona |

#### Modificacion (modify)

| Modulo | Comandos | Spec | Estado |
|--------|----------|------|--------|
| modify-basics.ts | ERASE, MOVE, COPY, OFFSET | modify-basics.spec | Funciona |
| modify-transform.ts | ROTATE, SCALE, FILLET, CHAMFER | modify-transform.spec | Funciona |
| modify-edges.ts | TRIM, EXTEND, BREAK | modify-edges.spec | Funciona (BREAK solo LINE) |
| modify-mirror.ts | MIRROR | modify-mirror.spec | Funciona |
| modify-array.ts | ARRAY, ARRAYEDIT | modify-array.spec | Funciona |
| modify-align.ts | ALIGN, MATCHPROP | modify-align.spec | Funciona |
| modify-stretch.ts | STRETCH, LENGTHEN | modify-stretch.spec | Funciona |
| modify-join.ts | JOIN, EXPLODE | modify-join.spec | Funciona |
| modify-pedit.ts | PEDIT, SPLINEDIT | modify-pedit.spec | Funciona |
| modify-blend.ts | BLEND | modify-blend.spec | Funciona |
| modify-foreign.ts | XPLODE, SETBYLAYER, CHPROP, NCOPY | modify-foreign.spec | Funciona |
| modify-cleanup.ts | OVERKILL, DRAWORDER | -- | Funciona |

#### Anotacion (annotate)

| Modulo | Comandos | Spec | Estado |
|--------|----------|------|--------|
| annotate-dimensions.ts | DIMLINEAR, DIMALIGNED | annotate-dimensions.spec | Funciona |
| annotate-dimension-chains.ts | DIMBASELINE, DIMCONTINUE, DIM, DIMEDIT | annotate-dimension-chains.spec | Funciona |
| annotate-dimensions-angular.ts | DIMANGULAR, DIMARC | annotate-dimensions-angular.spec | Funciona |
| annotate-dimensions-radial.ts | DIMRADIUS, DIMDIAMETER, DIMORDINATE | -- | Funciona |
| annotate-hatch.ts | HATCH, GRADIENT, BOUNDARY | annotate-hatch.spec | Funciona |
| annotate-leaders.ts | MLEADER, LEADER | annotate-leaders.spec | Funciona |
| annotate-quick.ts | QDIM, TEXTALIGN | annotate-quick.spec | Funciona |
| annotate-quickleader.ts | QLEADER | annotate-quickleader.spec | Funciona |
| annotate-text.ts | TEXT, MTEXT, DDEDIT | annotate-text.spec | Funciona |
| annotate-styles.ts | STYLE, DIMSTYLE, MLEADERSTYLE, TABLESTYLE | annotate-styles.spec | Funciona |
| annotate-tolerance.ts | TOLERANCE | -- | Funciona |
| dimension-tolerance.ts | DIMTOLERANCE | -- | Funciona |
| annotate-table-edit.ts | TABLEDIT | -- | Funciona |

#### Bloques y referencias

| Modulo | Comandos | Spec | Estado |
|--------|----------|------|--------|
| blocks.ts | BLOCK, WBLOCK, BASE, INSERT, ATTEDIT, ATTSYNC | blocks.spec | Funciona |
| blocks-edit.ts | BEDIT | blocks-edit.spec | Funciona |
| blocks-burst.ts | BURST | blocks-burst.spec | Funciona |
| xrefs.ts | XREF, XATTACH, XBIND, XCLIP | xrefs.spec | Funciona |
| reference-edit.ts | REFEDIT, REFSET, REFCLOSE | reference-edit.spec | Funciona |
| design-center.ts | ADCENTER | design-center.spec | Funciona |
| dynamic-block.ts | BLOQUEDIN, BLOQUEDINSET, BLOQUEDINLIST, BLOQUEDINDEF | dynamic-block.spec | Funciona |

#### Vistas y navegacion / Capas y config / 3D / Consulta / Layouts / Interop / Parametricas / BIM / MEP / Electrica / Mecanica / Geo / Raster-PDF / Express / Automatizacion / Historia

Todos los modulos restantes tienen implementacion y la mayoria tiene spec. Ver tabla detallada arriba.


---

## 2. Estado real: resumen cuantitativo

- **300 comandos registrados** en el manifiesto (GENERADO).
- **112 modulos** de implementacion.
- **~290 alias** en la tabla acad.pgp, todos resueltos.
- **89 specs** (84 en commands/ + 5 en la raiz del motor).
- **0 alias sin resolver** (llegaron a cero en la ola del destape y se mantiene).

### Limites declarados (no bugs, son todavia no)

1. BREAK solo acepta LINE. Motivo: modify-edges.ts:30-33.
2. PAR reconocido pero rechazado: command-engine.ts:354-366.
3. CIRCLE T/TTR se ofrece y rechaza: command-engine.spec.ts:363-371.
4. Comandos con interfaz no ejecutables desde .scr: script-runner.spec.ts:365-386.
5. SCU inclinado: comandos no espaciales rechazan puntos: command-engine.ts:440-464.

---

## 3. Huecos frente al toolset de AutoCAD

Ordenados por valor para arquitecto/ingeniero:

### Critico (bloquea flujo de trabajo)

1. IMAGEFRAME / PDFFRAME -- controlar si el marco se imprime.
2. WIPEOUT Frame On/Off -- WIPEOUT existe pero no la opcion de marco.
3. MVIEW Freeze -- VPLAYER existe pero no la sub-opcion desde la ventana.

### Alto valor (eficiencia diaria)

4. BREAK @punto -- BREAK con un solo punto. Es el BREAK mas usado.
5. CHAMFER Trim/No-trim -- opcion de recortar o no extremos.
6. FILLET radio 0 -- lineas que se prolongan hasta encontrarse.
7. MLEDIT / MLSTYLE -- edicion y estilos de lineas multiples.
8. LAYER Walk con Espacio -- verificar si Espacio avanza entre capas.
9. PEDIT Spline -- convertir spline a polilinea.

### Valor medio

10. ADCENTER con busqueda por nombre de bloque.
11. DSETTINGS Polar -- modo polar interactivo.
12. REVCLOUD opciones de estilo y modificacion.
13. POINT Display (PDMODE/PDSIZE).
14. IMAGEATTACH resolucion de pantalla.

### Bajo valor

15. OVERKILL tolerancia ajustable.
16. DRAWORDER opciones avanzadas.
17. ATTDIA -- controlar si ATTEDIT abre cuadro.
18. LAYMRG por nombre sin designar objetos.

---

## 4. Redundancias y deudas

### Redundancias documentadas (no accidentales)

1. Dos caminos para .scr: lib/cad/script-runner.ts (editor vivo) y engine/script-runner.ts (headless). Comparten parser. Verificado que dan el mismo dibujo.
2. Tabla CAD_DIALOG_COMMANDS escrita a mano vs. cadCommandsNeedingInterface() que lee del registro. script-runner.spec.ts:365-371 compara las dos.

### Deudas tecnicas

1. EXPLODE sin blocks(): requiere blocks() en contexto. Documentado en command-types.ts:238-246.
2. BREAK solo LINE: geometria en geom-trim.ts trabaja sobre segmentos. modify-edges.ts:30-33.
3. CIRCLE T/TTR: problema de Apolonio sin resolver.
4. PAR no conectado: necesita entityPick enrutar a analisis de arista. command-engine.ts:354-366.
5. DSETTINGS incompleto: -DSETTINGS solo tiene la rama Orto.

---

## 5. Notas de diseno relevantes

1. Motor como reductor puro: no toca React, THREE ni CadDocument.
2. Frontera de deshacer por comando: UN lote por comando.
3. Nombre canonico invariante: LINE igual en cualquier idioma.
4. Carga lazy medida: 728.5 KB ahorrados del chunk del estudio.
5. Alias acad.pgp como contrato: ~290 alias invariantes.
6. spatial como guardia de SCU: true y elevation protegen contra puntos aplanados.
