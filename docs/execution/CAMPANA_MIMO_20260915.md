# Campaña MiMo — 2026-09-15

Rama: `claude/noche-mimo-razones-para-pagar`
Base: contiene `claude/main-verde-firefox-specs @ 0a5f5600`

## Línea base medida

- rúbrica: 256/309 destino, 186/213 hoy
- comandos en el registro: 300
- `Layout3DEditor.tsx`: ~16900 líneas, 125 `useState`
- goldens: 147 · specs de verificación: 25
- command-integrity: OK (300 comandos)

## Estado de las tareas (CORREGIDO — identificadores de la cola)

| Tarea | Estado | Nota |
|---|---|---|
| T1 | PARCIAL | 3DMOVE/3DROTATE registrados, e/f/dz corregido, specs no ejecutan comandos reales (hallazgo t1-3) |
| T2 | PARCIAL | SLICE/SECTION con planos coordenados corregido (crash, cota0, local plane); specs reescritos pendientes (t2-5) |
| T3 | EN COLA | EXTRUDE en la normal del perfil |
| T4.1 | HECHA | ray-BRep face picking (brep-raycast.ts, 21 aserciones) |
| T4.2 | EN COLA | Arista más cercana en pantalla |
| T4.3 | EN COLA | Ctrl+clic con ciclo de selección |
| T4.4 | EN COLA | Referencia persistente a cara/arista |
| T4.5 | EN COLA | FILLETEDGE/CHAMFEREDGE con aristas designadas |
| T5 | EN COLA | VSCURRENT sobre muros |
| T6 | EN COLA | SECTIONPLANE/LIVESECTION |
| T7 | PARCIAL | Alzados: tope polar se restaura antes de update() (hallazgo vista-1) |
| T8 | PARCIAL | VISUALSTYLES: Conceptual/Grayscale retirados (copias de shaded-edges); Xray funciona |
| T9 | PARCIAL | PERSPECTIVE: icono+summary añadidos, pero variable sin lectores (hallazgo vista-2) |
| T10 | EN COLA | VPORTS en el modelo |
| T11 | EN COLA | Transparencia de capa y objeto |
| T12 | PARCIAL | Orientación de caras corregida, spec tautológico (hallazgo geometria-1) |
| T14 | HECHA | Cuadros con unidad correcta (CSV, LISP, comentarios corregidos) |
| T17 | YA ESTABA | cadWireNumberLabel en electrical-wire.ts |
| T18 | HECHA | CENTERMARK/CENTERLINE |
| T19 | HECHA | STEELSHAPE + BOM |
| T20 | YA ESTABA | attributes.TAG en mep-symbols.ts |
| T21 | YA ESTABA | horizontalProfilesOf rechaza inclinados |
| T22 | PARCIAL | Aristas cóncavas filtradas + planas/borde; spec pendiente (hallazgo geometria-3) |
| T23 | PARCIAL | STEP/IGES descargable: spec corregido, Firefox fix, multi-sólido pendiente (hallazgo t23-3) |
| T-1.1 | HECHA | Contexto de selección publicado (selection-context.ts, 22 aserciones) |

## Hallazgos de revisión abiertos

### Severidad media
- **t1-3**: specs de 3D no ejecutan comandos reales
- **t1-4**: eje por dos puntos usa base como centro
- **t2-4**: Izquierda/Derecha incorrecto en planos coordenados
- **t2-5**: spec no ejercita coordinatePlane ni comandos
- **vista-1**: tope polar se restaura antes de OrbitControls update()
- **vista-3**: VPOINT Rotar no pasa por onBeforeCommandedView
- **vista-4**: T7 sin spec
- **geometria-1**: spec de orientación de caras es tautológico
- **geometria-3**: T22 sin spec

### Severidad baja
- **t1-8**: Rodrigues duplicado, defaults duplicados
- **t23-3**: multi-sólido concatena archivos inválidos
- **t23-4**: unidad siempre mm en exportación
- **bitacora-estados-1**: tabla de estados desfasada (CORREGIDO en esta bitácora)

## COLA 3D — Siguiente tarea

Ronda 1: 3DSCALE (agente A) + T-2.1 pestaña contextual (agente B)
