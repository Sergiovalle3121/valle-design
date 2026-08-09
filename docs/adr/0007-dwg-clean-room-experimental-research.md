# ADR-0007: Laboratorio experimental clean-room para interoperabilidad DWG

- Estado: aceptado
- Fecha: 2026-08-09

## Contexto

ADR-0004 mantiene DWG fuera del producto y sólo contemplaba habilitarlo mediante
un proveedor autorizado. El propietario ha autorizado investigar una
implementación original de Valle para interoperar con archivos DWG sin ODA,
RealDWG ni otro codec comercial. Esa autorización permite investigación dentro
de este repositorio, pero no es un dictamen jurídico, una licencia sobre DWG,
una certificación ni permiso para usar material restringido.

El formato es binario, complejo y hostil por defecto. Reconocer una firma o
leer metadata no equivale a importar un dibujo. El producto debe seguir
rechazando DWG hasta que una decisión posterior demuestre, con evidencia
independiente, seguridad, fidelidad, procedencia y una integración completa.

## Decisión

Autorizar un laboratorio clean-room aislado en `packages/dwg-codec/` con estas
fronteras:

- package npm privado, `UNLICENSED`, experimental y no publicable;
- entrada binaria mediante `Uint8Array`, sin convertir el límite hostil a
  `string`;
- cero dependencias hacia `apps/web`, React, NestJS, persistencia o
  `CadDocument`;
- salida neutral de base de objetos, diagnostics y manifiesto de pérdidas; un
  adaptador futuro y separado sería responsable de producir el único
  `CadDocument` canónico;
- sin red, filesystem implícito, telemetría, estado global, macros, scripts,
  OLE, URLs, rutas o comandos embebidos; y
- sin provider, endpoint, upload, feature flag, botón, entitlement ni
  integración runtime durante DWG-0.

La descripción permitida en esta etapa es:

> Investigación experimental interna de interoperabilidad; no disponible en el producto.

## Relación con decisiones anteriores

Esta decisión amplía ADR-0004 únicamente para permitir investigación
clean-room de una implementación propia y original. Siguen vigentes sus límites
de producto: UI, API, documentación comercial y marketing no pueden declarar
compatibilidad, importación, exportación ni disponibilidad DWG. El
`CadInteroperabilityProvider` de arranque debe continuar con
`available:false`.

ADR-0003 también sigue vigente. El parser binario no puede crear un segundo
kernel semántico, documento, command bus o historial. TypeScript estricto es el
baseline y fallback worker-compatible. Rust sólo puede entrar mediante un ADR
posterior y focal si perfiles, pruebas diferenciales, memoria acotada,
toolchain reproducible, benchmarks, SBOM y licencias satisfacen sus gates.

## Clean-room y procedencia

Antes de derivar código, tests, fixtures, tablas, constantes o comentarios de
una fuente, se registra en `packages/dwg-codec/SOURCE_REGISTER.json` su
propietario, origen exacto, título, versión/fecha, términos, estado, hechos
consultados, archivos derivados y revisor.

- Sólo una fuente con estado `allowed` puede producir archivos derivados.
- Una fuente ambigua queda `quarantined`; no se extraen hechos ni código de
  ella hasta resolver y registrar sus términos.
- Está prohibido copiar, traducir, portar o adaptar implementaciones, headers,
  bindings, tablas, comentarios o tests de Autodesk, RealDWG, ODA, LibreDWG u
  otro codec.
- También están prohibidos material filtrado, descompilación, evasión de
  protecciones y fuentes con GPL, AGPL, LGPL, MPL, SSPL, BUSL,
  source-available, o material de terceros bajo licencia comercial/restringida,
  desconocida o `NOASSERTION`. El código first-party de Valle conserva los
  términos propietarios del repositorio.
- Una especificación públicamente accesible no queda autorizada por el mero
  hecho de ser pública. Sólo se extraen hechos técnicos mínimos cuya consulta
  y uso estén documentados como permitidos.
- Los fixtures publicables deben ser sintéticos de Valle, creados por Sergio
  con autorización expresa de publicación o de terceros con licencia explícita
  de uso y redistribución. Cada fixture cumple el schema versionado y conserva
  SHA-256 y procedencia.

La política operativa completa está en
`packages/dwg-codec/CLEAN_ROOM_POLICY.md`; las reglas obligatorias para agentes
están en `packages/dwg-codec/AGENTS.md`.

## Seguridad y promoción de capacidades

Cada byte se trata como hostil. Toda lectura usa cursores acotados, aritmética
comprobada, budgets inmutables y errores tipados con offset. Truncación,
overflow, rangos inválidos, duplicados, solapamientos, ciclos, trabajo excesivo
y checksums inválidos cuando apliquen deben fallar de forma determinista y
cerrada, sin `RangeError`, panic, hang ni reserva no acotada.

La matriz de `packages/dwg-codec/CAPABILITIES.md` es la única fuente de claims
del laboratorio. Una capacidad no se promueve por un fixture generado sólo por
el mismo código, una prueba superficial o una implementación sin consumidor y
evidencia independiente.

Habilitar DWG en el producto requiere otro ADR. Como mínimo deberá resolver la
revisión jurídica y de seguridad, corpus redistribuible independiente, fuzzing,
límites, fidelidad, pérdidas, tenancy, mapping al documento canónico,
importación real, CI/E2E y operación. Este ADR no preautoriza ese cambio.

## Consecuencias

Valle puede construir fundamentos originales y medibles sin introducir un
codec comercial ni relajar la honestidad del producto. La duplicación temporal
de la gramática de firma existente se tolera sólo mientras no haya integración
runtime: `check:dwg` debe verificar paridad de versiones y conservar los tests
que demuestran que el producto rechaza DWG. Una integración futura deberá hacer
del detector web un adaptador del límite binario y eliminar la tabla duplicada.

El repositorio es público; branches y PR no son secretos comerciales. No se
suben planos de clientes, archivos encontrados al azar, ejemplos instalados con
software de terceros, tokens, datos personales ni material confidencial.

## Alternativas rechazadas

- Reescribir ADR-0004 como si nunca hubiera existido.
- Conectar un decoder experimental al producto durante DWG-0.
- Usar un contrato `string` para aparentar soporte binario.
- Adivinar layouts, sentinels, CRC, tablas o constantes sin fuente permitida y
  vectores independientes.
- Introducir Rust, WASM o una dependencia runtime sin cumplir sus gates.
- Llamar “importación DWG” a detección de firma, metadata o envelope.
