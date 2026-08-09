# ADR-0008: Programa first-party DWG-1 de lectura y escritura

- Estado: aceptado
- Fecha: 2026-08-09
- Directiva: `packages/dwg-codec/OWNER_DIRECTIVE_DWG1.md`

## Contexto

ADR-0007 autorizó el laboratorio clean-room y mantuvo la disponibilidad DWG
fuera del producto. El propietario ahora autoriza avanzar hacia un reader y un
writer originales de Valle, sin codecs runtime ajenos, con una definición de
conformidad acotada y verificable. La autorización del programa no aporta hechos
técnicos sobre el formato ni demuestra compatibilidad.

## Decisión

Se autoriza desarrollar simultáneamente lectura y escritura first-party para
la matriz v1 registrada en
`packages/dwg-codec/COMPATIBILITY_MATRIX.v1.json`. La matriz cubre los nueve
códigos objetivo, ambas direcciones y cada propiedad registrada dentro de su
familia. Cada celda versión/dirección/familia/propiedad tiene un estado
explícito y referencias a facts y evidencia; el gate rechaza huecos,
solapamientos, evidencia que no cubra la propiedad exacta, referencias no
permitidas y promociones sin evidencia suficiente.

Esta expansión es una matriz de alcance familia/propiedad, no el catálogo
cerrado de clases solicitado para conformidad. En esta revisión
`classRegistryComplete:false` obliga que las 1.134 celdas permanezcan
`not-started`. Una revisión futura del schema sólo podrá marcar el registro
completo con facts técnicos autorizados y cobertura exacta de `classIds` y sus
propiedades; hasta entonces no existe una matriz de clases completa.

La investigación se separa de la implementación mediante artefactos:

1. una fuente se registra y revisa en `SOURCE_REGISTER.json`;
2. el hecho mínimo queda congelado en `FACT_REGISTER.json`, con términos, hash,
   revisión humana y derivados;
3. sólo facts `allowed` pueden sustentar código, fixtures o una celda;
4. la evidencia de conformidad obtiene un ID inmutable y hashes verificables;
5. la promoción ocurre sólo sobre CI verde del SHA exacto.

Fuentes o facts `quarantined` y `prohibited` no se descargan, resumen
técnicamente ni usan para derivar trabajo. El archivo DWG tampoco puede cargar
o ejecutar código; macros, OLE, URLs, paths, xrefs y payloads embebidos se
mantienen inertes.

## Corpus

Los fixtures redistribuibles permanecen bajo `fixtures/` y se admiten sólo por
manifiesto, hash, fuente `allowed`, permiso explícito y oráculo fail-closed. El
corpus no redistribuible deberá vivir desde su creación en el repositorio
privado compañero `valle-design-dwg-conformance`. El schema y el checker
estructural local definen el contrato de bundles; el repositorio compañero y su
CI todavía no existen, por lo que no se afirma descarga, verificación física ni
consumo privado en este corte. Cuando se implemente, no copiará bytes al
repositorio principal, logs, artifacts públicos ni caches compartidos.

`CORPUS_INTAKE.md` y `corpus-intake.schema.json` gobiernan ambos destinos. El
segundo revisor confirma derechos, ausencia de información de clientes,
herramienta de creación y ground truth antes de aceptar material.

## Activación y claims

`productionAvailable:false` es un invariante hasta que las nueve versiones
cumplan juntas la matriz, reader, writer, integración, seguridad, corpus y
validación independiente. Implementar una celda no activa una versión. Detectar
una firma no equivale a leer un DWG; abrir un archivo autocreado no demuestra
interoperabilidad; una salida no se declara válida sin lectores independientes
autorizados.

La activación futura requiere otro ADR y promoción interna, piloto y GA. Hasta
entonces no se añaden provider, endpoint, upload, UI, marketing ni claim de
compatibilidad productiva.

## Consecuencias

- Reader y writer pueden avanzar en el laboratorio con gates comunes.
- El conteo y tamaño artificial de fixtures deja de ser una constante; se
  conserva un límite por archivo, paths seguros y conjunto exacto manifestado.
- Un fixture sintético sólo demuestra comportamiento interno. Un resultado
  `ok` exige material autorizado y un oráculo aplicable, pero aun así no promueve
  por sí solo una celda de la matriz.
- El repositorio público no almacena corpus privado, material en cuarentena ni
  documentación técnica confidencial.
- La falta actual de facts técnicos y corpus independiente mantiene toda la
  matriz de decodificación y codificación en `not-started`.

## Alternativas rechazadas

- Habilitar versiones conforme avanza su detector de firma.
- Adivinar layouts, constantes, checksums o algoritmos.
- Usar una fuente pública sin revisión de términos.
- Guardar el corpus privado dentro del monorepo después de privatizarlo.
- Aceptar pérdidas silenciosas o un resultado parcial.
