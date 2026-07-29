# CAD Acceptance Journey IV — matriz neutral 1–50

## Resultado

Los 50 pasos tienen evidencia ejecutable localizada. Los pasos 1–45 son
`browser-proven`; 46–50 son gates `performance` ejecutados en Chromium con
artefactos JSON. El manifiesto canónico es
`apps/web/e2e/golden/cad-acceptance-journey.ts` y su checker rechaza números
faltantes/duplicados, acciones duplicadas o rutas inexistentes.

| # | Acción | Nivel | Evidencia principal |
| ---: | --- | --- | --- |
| 1 | Abrir dibujo | browser-proven | #26 precisión |
| 2 | Elegir unidades | browser-proven | #26 precisión |
| 3 | Crear capas | browser-proven | #24 capas / #26 |
| 4 | Coordenadas absolutas | browser-proven | #26 precisión |
| 5 | Coordenadas relativas | browser-proven | #26 precisión |
| 6 | Polar | browser-proven | #26 precisión |
| 7 | Dynamic input | browser-proven | #13 / #26 |
| 8 | Endpoint | browser-proven | #28 OSNAP pointer |
| 9 | Midpoint | browser-proven | #28 OSNAP pointer |
| 10 | Intersection | browser-proven | #28 OSNAP pointer |
| 11 | Perpendicular | browser-proven | #28 OSNAP pointer |
| 12 | Tangent | browser-proven | #28 OSNAP pointer |
| 13 | Polilínea cerrada | browser-proven | #26 precisión |
| 14 | Offset | browser-proven | #26 precisión |
| 15 | Trim | browser-proven | #25 LINE edit |
| 16 | Extend | browser-proven | #25 LINE edit |
| 17 | Fillet | browser-proven | #23 FILLET |
| 18 | Window selection | browser-proven | #12 selección |
| 19 | Crossing selection | browser-proven | #12 selección |
| 20 | Lasso | browser-proven | #12 selección |
| 21 | Selection cycling | browser-proven | #12 selección |
| 22 | Editar grips | browser-proven | #12 selección |
| 23 | HATCH por punto interior | browser-proven | #14 HATCH |
| 24 | Cambiar boundary / associativity | browser-proven | #14 HATCH |
| 25 | MTEXT | browser-proven | #15 MTEXT |
| 26 | Dimensiones asociativas | browser-proven | #16 DIMENSION |
| 27 | Mover geometría / verificar cotas | browser-proven | #16 DIMENSION |
| 28 | MLEADER | browser-proven | #17 MLEADER |
| 29 | Crear bloque | browser-proven | #18 BLOCK |
| 30 | Múltiples instancias | browser-proven | #18 BLOCK |
| 31 | Cambiar atributo | browser-proven | #18 BLOCK |
| 32 | Crear layout | browser-proven | #20 viewports |
| 33 | Varios viewports | browser-proven | #20 viewports |
| 34 | Escalas | browser-proven | #20 viewports |
| 35 | Override de capa | browser-proven | #20 viewports |
| 36 | Publicar PDF | browser-proven | #20 viewports |
| 37 | Guardar | browser-proven | #26 precisión |
| 38 | Cerrar | browser-proven | #10 sesión / #11 recovery |
| 39 | Recuperar borrador | browser-proven | #11 recovery |
| 40 | Recargar | browser-proven | #10 entidades |
| 41 | Comparar revisiones | browser-proven | #22 colaboración |
| 42 | Importar DXF | browser-proven | #27 interoperabilidad |
| 43 | Editar importado | browser-proven | #27 interoperabilidad |
| 44 | Exportar DXF | browser-proven | #27 interoperabilidad |
| 45 | Verificar loss manifest | browser-proven | #27 interoperabilidad |
| 46 | Abrir 10k | performance | gate 10k/100k |
| 47 | Medir 10k | performance | gate 10k/100k |
| 48 | Abrir 100k | performance | gate 10k/100k |
| 49 | Seleccionar fuera del viewport | performance | gate 10k/100k |
| 50 | Medir y producir artefactos | performance | gate 10k/100k |

## Cifras del gate vigente

- 10k: payload 1,460,189 bytes; canónico listo 6,861 ms; frame de control
  105.9 ms.
- 100k: payload 14,690,240 bytes; canónico listo 11,741 ms; detalle listo
  28,565 ms; frame de control 58.6 ms; zoom/replan 26,403 ms.
- Viewport 100k: 100,000 visibles / 2,500 detalladas inicialmente; 68,200
  visibles / 2,500 detalladas tras zoom; la entidad `perf-arc-099999`, fuera
  del detalle, fue seleccionada y materializada mediante el índice canónico.
- Heap observado por Chromium: 364 MB usados, 462 MB reservados, límite 2.33 GB.

Estas cifras son mediciones de un run local y no constituyen un claim de 60 FPS
ni una garantía de hardware/producción. Los adjuntos JSON de Playwright son la
fuente autoritativa de cada ejecución.
