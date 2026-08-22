# Valle Design CAD Professional Daily Driver — ejecución

Fecha de corte: 2026-07-26
Base sincronizada y rebase final: `418c087a25a1ce41c1d3c1eac5bff15ea47bd783`
Rama: `agent/valle-cad-professional-daily-driver`

## 1. Objetivo y frontera honesta

Este corte convierte el ploteo histórico en una vertical persistida de
`paper space → viewport → sheet set → PDF vectorial → recibo auditable`, dentro
del editor existente `Layout3DEditor`. No crea otro editor ni declara paridad
total con AutoCAD, soporte DWG nativo, kernel 3D profesional, 100k entidades
interactivas o fidelidad completa de todos los patrones DXF.

La vertical se eligió porque `CadDocument` ya declaraba `paperSpaces`, pero el
runtime no los editaba: el PDF era una hoja fija más una captura raster 3D, no
había conjunto ordenado, lock/escala/capas por viewport ni evidencia de quién
publicó qué bytes.

## 2. Baseline y colisiones

- `origin/main` se rebasó antes de editar; la entrega customer-ready #1406 ya
  estaba integrada en la base.
- Baseline ejecutado sobre la base: web 104/104 specs; API CAD/line-engineering
  36 suites y 223 tests; typecheck web y API verdes.
- Se preservan `CadDocument` schema 3 y la tabla JSONB existente. No hay
  migración destructiva ni nueva fuente canónica.
- El límite de persistencia sigue en 8 MB. Se agregan límites específicos de
  500 hojas, 32 viewports por hoja y 1,000 recibos; no se elevan límites para
  esconder deuda de rendimiento.

## 3. Benchmark de referencia

Las referencias oficiales usadas como benchmark funcional son:

- [Autodesk: layout viewports](https://help.autodesk.com/cloudhelp/2027/ENU/AutoCAD-Core/files/GUID-93641503-3EA3-4BC3-8E47-A33EAA6CD20A.htm): múltiples viewports, escala, lock y overrides de capa.
- [Autodesk AutoCAD features](https://www.autodesk.com/es/products/autocad/features): layouts con tamaño de papel/cajetín/vistas y administración/publicación de múltiples hojas.
- [Autodesk AutoCAD updates](https://www.autodesk.com/solutions/aec/autocad-updates): mejoras recientes en hatch, limpieza geométrica y cambio de layouts; se usa como señal, no como claim de equivalencia.

## 4. Flujo implementado

1. La UI carga `CadDocument.paperSpaces`, muestra tabs de layout y permite
   crear una hoja o un demo reproducible de tres hojas.
2. Cada hoja persiste orden, inclusión en publicación, papel, orientación,
   page setup, cajetín y viewport con bounds de papel/modelo, escala, lock,
   visibilidad y overrides de capa.
3. Los cambios entran al mismo checkpoint de undo/redo y al mismo guardado CAS
   que la geometría del editor.
4. El publicador construye un plan vectorial desde el documento canónico,
   expande bloques vivos y emite líneas, polilíneas, círculos, arcos, elipses,
   splines, texto/MText, cotas, leaders, conectores y hatch sólido.
5. Cada viewport se recorta en PDF. Las hojas mantienen formato/orientación,
   marco, cajetín y orden del sheet set. No se agrega captura raster.
6. Antes de descargar, el cliente calcula SHA-256 de los bytes y la API agrega
   un recibo mediante CAS con actor derivado del contexto tenant, hoja(s),
   filename, hash, bytes y fecha. El Event Ledger recibe
   `SF_CAD_SHEET_SET_PUBLISHED`; nunca recibe el contenido del plano.

## 5. Matriz de capacidad

| Capacidad                         | Estado de este corte                | Límite explícito                                                    |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Paper spaces persistidos          | funcional                           | page setup custom no tiene editor libre de márgenes                 |
| Tabs y orden de layouts           | funcional                           | sin drag-and-drop; subir/bajar determinista                         |
| Viewport escala/lock/model bounds | funcional                           | un viewport editable por hoja en esta UI; el contrato admite varios |
| Capas por viewport                | motor funcional y probado           | editor visual de overrides queda pendiente                          |
| Cajetín y atributos               | funcional                           | bloque gráfico de cajetín configurable queda pendiente              |
| Sheet set de tres hojas           | funcional                           | plantilla demo, no biblioteca corporativa                           |
| PDF multihoja vectorial           | funcional para entidades soportadas | hatch con patrón publica boundary y warning                         |
| Bloques vivos en publish          | funcional                           | nesting acotado a 8 y ciclos reportados                             |
| Recibo hash/actor/CAS             | funcional                           | almacena metadata, no el binario PDF                                |
| DXF                               | carril existente                    | esta vertical no amplía fidelidad DXF/DWG                           |
| DWG nativo                        | no soportado                        | proveedor/interoperabilidad futura                                  |
| 100k interactivo                  | no demostrado                       | límites y benchmarks previos permanecen                             |

## 6. Seguridad, tenancy y confiabilidad

- El endpoint de publicación exige `engineering:write`.
- `model` y `revision` se resuelven con repositorio tenant-scoped; tenant,
  planta y actor no se aceptan del cliente.
- El UPDATE incluye tenant, planta, soft-delete y versión esperada. Un writer
  stale recibe `cad_document_version_conflict`.
- La API verifica que las hojas existan, estén incluidas y no se repitan.
- `publications` es server-managed: el guardado general sólo puede devolver la
  lista leída y no puede insertar, alterar o borrar recibos.
- SHA-256 debe ser hexadecimal de 64 caracteres; bytes, arrays, profundidades,
  escalas y bounds tienen límites/finitud explícitos.
- La descarga sólo ocurre después de que el recibo auditable quedó persistido.

## 7. Evidencia y degradaciones

Pruebas nuevas cubren:

- demo de tres hojas, orden estable y round-trip de viewports/cajetín;
- publicación sin comandos raster;
- curvas, anotaciones, hatch, leaders y expansión de bloque/atributo;
- visibilidad distinta de una capa entre viewports;
- warnings de patrón no emitido y bloque faltante;
- validación API de escalas/bounds/hash;
- recibo con actor, incremento de versión, CAS stale y hoja inexistente.

Desde la Ola 2 de capas, `ANSI31` y el resto de hatch no sólidos publican sus
TRAZOS de patrón además del contorno (`hatch-publish-strokes.ts`, mismo
generador que la pantalla); la degradación quedó reservada a la guarda de
densidad, que cae a contorno con warning `hatch_pattern_too_dense` cuando el
patrón proyecta por debajo de 0,3 mm en papel o supera el tope de trazos. PNG
y GLB siguen siendo exportaciones explícitas y separadas; no participan en el
PDF de hoja.

## 8. Rollback

La evolución es aditiva en schema 3. Revertir el PR retira UI, publicador y
endpoint sin borrar documentos. Clientes anteriores ignoran `pageSetup`,
`viewports`, `titleBlock` y `publications`; la geometría/model space y su
proyección histórica permanecen intactos.

## 9. Gates de entrega

Evidencia local del corte:

- typecheck web y API: verde;
- build de producción web y API: verde;
- specs web: 105/105;
- suites API dirigidas a la vertical: 2/2, 52/52 tests;
- lint dirigido: API sin hallazgos; web sin errores y 17 warnings históricos
  del componente monolítico (el baseline previo documentaba 25);
- capability registry: 23 capacidades válidas;
- tenant-safety: 40/40 tests y baseline estable de 972/972 hallazgos
  (39 critical, 705 high, 228 medium), sin incremento;
- QA visual local: creación del demo de tres hojas, lock/unlock de viewport,
  cambio de escala, reordenamiento y manifiesto sincronizado.

El número de PR, el head remoto y el SHA fusionado se completan al publicar. La
única señal válida de merge será el gate remoto `Build · Test · Lint · Smoke`
verde sobre el head exacto y la verificación posterior de `origin/main`.
