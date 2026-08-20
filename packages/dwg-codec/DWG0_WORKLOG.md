# DWG-0 work log

## Preflight 2026-08-09

- Base resuelta después de `git fetch --all --prune`:
  `c792f938e8c962b641caf59d54f46f86bb52168d` (`origin/main`).
- CI exacta de esa base: run `31295979439`, cuatro jobs completos y verdes,
  incluido PostgreSQL + Playwright Chromium/Firefox.
- Checkout ajeno detectado: `claude/merge-work-eors1o`, dirty. No se modificó,
  no se hizo stash/reset/checkout y se creó un worktree aislado.
- PR preexistentes #49 y #28: sólo inspeccionados; no se modificarán, cerrarán
  ni fusionarán en DWG-0.

| Categoría                  | Alcance                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archivos de PR 1           | ADR-0007, gobernanza scoped, registro/schema de fuentes, threat model, capability matrix, schema de fixtures y aclaraciones mínimas de documentos vivos. |
| Archivos previstos de PR 2 | `packages/dwg-codec/**`, scripts/gate raíz, manifests/lockfile y CI; sólo desde un `origin/main` posterior a PR 1.                                       |
| Prohibidos                 | `Layout3DEditor.tsx`, ramas/PR ajenos, UI/API/provider/runtime, documentos históricos y refactors CAD generales.                                         |
| Riesgo de concurrencia     | `AGENTS.md`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `docs/adr/*` e `interop-provider.*`; revalidar antes de cada merge.        |
| Terminado de PR 1          | Gobernanza aceptada, diff sin claims falsos, gates locales verdes, CI completa verde sobre head exacto, mergeable sin bypass y `main` posterior verde.   |
| Terminado de DWG-0         | Baseline TS seguro, corpus sintético/procedencia, adversariales/fuzz/benchmark, decisión medida de lenguaje y producto aún `available:false`.            |

## Baseline local

| Comando/evidencia           | Resultado                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                    | 1,026 packages instalados desde lockfile; exit 0. npm reportó deuda preexistente de 4 vulnerabilidades (1 moderada, 3 altas); no se ejecutó `npm audit fix`. |
| `npm run check:cad`         | Exit 0: 38 operaciones; 683 fuentes sin rutas legacy; 688 archivos dentro del presupuesto, 17 allowances.                                                    |
| `cad-format-detect.spec.ts` | 12/12; exit 0.                                                                                                                                               |
| `interop-provider.spec.ts`  | Provider DWG sigue no disponible; exit 0.                                                                                                                    |
| `document-import.spec.ts`   | `.dwg` sigue rechazado; exit 0.                                                                                                                              |

La primera invocación aislada de `interop-provider.spec.ts` desde la raíz no
resolvió el alias `@/`; se repitió desde `apps/web`, que es el contexto real del
runner de CI, y pasó. No fue un fallo del producto ni se modificó código para
ocultarlo.

## Gates locales de PR 1

Todos los comandos se ejecutaron en la rama `agent/dwg0-governance` basada en
`c792f938e8c962b641caf59d54f46f86bb52168d`. PR 1 no contiene package
ejecutable, por lo que `check:dwg`, `check:fixtures`, `check:provenance`, fuzz y
benchmark empiezan en PR 2; sus contratos y schemas sí quedan gobernados aquí.

| Comando/evidencia                        | Duración relevante | Resultado                                                                                                                                      |
| ---------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                 | 105.6 s            | Exit 0; 1,026 packages. Deuda base reportada por npm: 1 vulnerabilidad moderada y 3 altas; no se ejecutó `npm audit fix`.                      |
| `npm run check:cad`                      | 8.3 s              | Exit 0; 38 operaciones OpenAPI, 683 fuentes sin rutas legacy y 688 archivos dentro del presupuesto con 17 allowances.                          |
| Tres specs de frontera DWG               | —                  | Exit 0; detector 12/12, provider DWG no disponible e importación de `.dwg` rechazada.                                                          |
| `npm run build`                          | 80.3 s             | Exit 0; 4/4 packages.                                                                                                                          |
| `npm run typecheck`                      | 33.0 s             | Exit 0; 5/5 tareas.                                                                                                                            |
| `npm test`                               | 172.5 s            | Exit 0; SDK 9/9, API 298 tests pasados y web 172/172 specs. Las suites PostgreSQL omitidas por este comando se ejecutan por separado en CI.    |
| `npm run lint` con memoria Node de 4 GiB | 161.7 s            | Exit 0; 2/2 tareas, 0 errores. Conserva 273 warnings API y 160 web preexistentes, todos fuera del código nuevo de PR 1.                        |
| `npm run sbom`                           | 5.5 s combinado    | Exit 0; CycloneDX con 113 componentes.                                                                                                         |
| `npm run check:licenses`                 | 5.5 s combinado    | Exit 0; 107 permitidos, 2 en revisión preexistente, 0 bloqueados y 0 desconocidos; PR 1 no añade dependencias.                                 |
| Revisión Ajv 8 estricta y adversarial    | —                  | Ambos schemas compilan; el source register valida; traversal, licencias prohibidas, límites y combinaciones contradictorias quedan rechazados. |

El primer `npm run lint` alcanzó el límite de heap por defecto de Node durante
web lint después de que API terminara con 0 errores. Se repitió el mismo comando
sin cambiar reglas, retries ni timeouts, usando 4 GiB como ya hace el build del
repositorio; la repetición completa pasó. Un sondeo posterior de 1 segundo fue
interrumpido por el timeout del wrapper antes de relanzar esa ejecución
supervisada; no se clasificó como fallo de producto.

## Fase 2 — fundamentos binarios

- PR 1 se fusionó por squash como
  `792c06036c6102b3e26d78a69007ecf500d844b1`; su head exacto tuvo cuatro jobs
  verdes. La rama de fase 2 partió del `origin/main`
  `8be49a5500758b46e20ebe746d81edf208083dc1`, que contiene ese squash.
- El run exacto de esa base, `31309553089`, terminó con quality, Gitleaks y SBOM
  verdes y un fallo E2E histórico de propiedades CAD en Firefox. La instrucción
  explícita posterior autorizó continuar la implementación aislada; no autoriza
  ocultar el rojo ni fusionar. PR 2 permanece bloqueado para merge hasta que el
  SHA exacto de `main` requerido tenga CI completa verde.
- La procedencia de código, fixtures y herramientas se registró antes de
  derivarlos en los commits `8a62316`, `62216c5`, `556c954` y `59a7c49`.
- Se añadieron sólo herramientas dev fijadas: Ajv `8.20.0`, ajv-formats `3.0.1`,
  tsx `4.23.1`, TypeScript `5.9.3` y `@types/node` `22.20.1`. El codec conserva
  cero dependencias runtime, `private:true` y `UNLICENSED`.
- El corpus contiene 21 archivos sintéticos first-party, 109 bytes y 21 hashes
  SHA-256 distintos. No contiene un DWG real ni material externo y ningún
  fixture declara resultado `ok`.
- No se consultó, copió, tradujo, portó ni adaptó implementación externa de
  Autodesk, RealDWG, ODA, LibreDWG u otro codec.

| Gate focal de fase 2  | Resultado                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:provenance`    | 5/5 fuentes permitidas, 80 archivos gobernados y 21 fixtures enlazados.                                                                                     |
| `check:fixtures`      | 21/21 archivos, 109 bytes y 21 hashes únicos; bytes/manifiesto coinciden con el generador determinista.                                                     |
| `check:no-io`         | 21 fuentes del núcleo, 4 probes dinámicos y 8 controles negativos; sin filesystem, red, telemetría ni estado de producto.                                   |
| `check:boundary`      | 21 fuentes y 24 archivos de laboratorio revisados; 2 controles de código dinámico, cero dependencias runtime e imports de producto.                         |
| Frontera de producto  | 4 workspaces, 4 manifests y 894 fuentes revisadas; 3 specs conservan rechazo/no disponibilidad y hay cero imports runtime del laboratorio.                  |
| Unitarias             | 100/100: API, versiones, snapshots, límites, cursores, aritmética, modelo neutral, arrays hostiles, errores y supervisor.                                   |
| Adversariales         | 349/349: truncación exhaustiva, 160 subcasos hostiles, límites, cancelación/deadline, worker no cooperativo y hardening de procedencia.                     |
| Fuzz smoke            | 20,000 ejecuciones en dos pasadas SHA-256 deterministas; input `0f51ac40…b648`, resultado `72cd5397…59fb`, sin crash, hang ni `DWG_INTERNAL_ERROR`.         |
| Benchmark smoke local | Node 22/Windows x64; snapshot exacto de 16 MiB en 9.875 ms y 16,777,223 unidades; resultado `decoder-unsupported`. Medición sin umbral ni claim productivo. |

## Decisión de lenguaje del corte

TypeScript estricto permanece como baseline, oráculo diferencial y fallback
worker-compatible. La medición actual sólo cubre snapshot y firma; no existe un
decoder común que permita demostrar una mejora material de Rust, paridad
diferencial o costes reales de memoria/CPU sobre estructuras DWG. Por tanto no
se añade Rust, WASM, toolchain nativo ni `unsafe` superficialmente.

El próximo gate profundo no es “decodificar por intuición”: requiere registrar
primero fuentes permitidas y vectores redistribuibles e independientes para el
envelope AC1015. Mientras sólo existan fixtures producidos por el mismo
generador, `ac1015Envelope`, object database, entidades, mapping, writer y
round-trip permanecen `unsupported`.

## DWG-1 sesión 2026-08-14 — códigos de bits (fase A del lector real)

Directiva del propietario (2026-08-13): construir el primer lector DWG real
del laboratorio, manteniendo el producto en `available:false` (ADR-0004/0007)
y la promoción condicionada a revisión legal externa.

- Fuente pública registrada ANTES de derivar código: `ODA-ODS-DWG-5.4.1-PUBLIC`
  (Open Design Specification for .dwg files 5.4.1, descarga pública de
  opendesign.com). Sólo hechos técnicos mínimos en `factsConsulted`; ninguna
  implementación externa consultada, copiada ni traducida.
- Política de procedencia extendida con la etiqueta exacta
  `ODA public guest-download specification (facts only, no redistribution)`
  para `public-documentation` (`scripts/provenance-validation.ts`).
- Nuevo `src/codecs/bitcodes.ts`: `DwgBitReader` sobre el `BitCursor` acotado
  (MSB-first fijado en el constructor) con B/BB/3B, RC/RS/RL/RD, BS/BL/BD,
  DD contra defecto (parche de 4/6 bytes bajos, simetría reservada para el
  writer de fase C), 2BD/3BD, BT/BE, modulares MC (con y sin signo, tope de
  8 bytes) y MS (tope de 2 palabras), handles H (código+contador+bytes BE,
  tope de 7 bytes de contador por rango seguro) y TV como BYTES con longitud
  declarada (la decodificación de página de códigos es de una capa superior).
  `resolveDwgHandleReference` resuelve absolutas/±1/offset/nula como función
  pura y falla cerrado ante códigos desconocidos o cruces por cero.
- Nueva `tests/unit/bitcodes.spec.ts`: vectores construidos a mano con un
  empaquetador first-party MSB-first; cada código con su gemelo triste
  (truncado real a granularidad de byte, banderas reservadas, contadores
  imposibles, modulares sin terminar) exigiendo `DWG_STRUCTURE_CORRUPT`.
- `npm run check` del paquete: verde completo (procedencia, fixtures, no-io,
  frontera, build, typecheck, unit, adversarial, fuzz determinista).
- Límite conocido: el parcheo DD por bytes bajos y la forma exacta de 3B
  quedan marcados para validación contra corpus real con derechos en la fase
  de intake; hasta entonces la evidencia es de round-trip de laboratorio.

## DWG-1 sesión 2026-08-14 (continuación) — contenedor AC1015 (fase B)

- Nuevo `src/codecs/crc16.ts`: CRC-16 reflejado (0xA001) table-driven con
  semilla del llamador, validado contra la respuesta conocida independiente
  CRC-16/ARC("123456789") = 0xBB3D, y la tabla de máscaras XOR de la cabecera
  por recuento de registros (3→0xA598, 4→0x8101, 5→0x3CC4, 6→0x8461).
- Nuevo `src/container/ac1015-file-header.ts`: `parseAc1015FileHeader` abre la
  cabecera R2000 —magia, mantenimiento, byte fijo 0x01, preview seeker,
  codepage, recuento— y valida el directorio de secciones con la RangeTable
  (límites del archivo, solapes, duplicados), el CRC enmascarado y el
  centinela final byte a byte. LOCALIZA, no decodifica contenido.
- Nueva `tests/unit/ac1015-header.spec.ts` con constructor de cabeceras
  first-party (semilla del writer de fase C) y gemelos tristes: magia ajena,
  recuento fuera de 3–6, solapes, sección dentro de la cabecera, CRC roto
  (con el offset exacto del fallo), centinela torcido, truncados y recuento
  que excede los registros presentes.
- `npm run check`: verde completo (133 unit + 349 adversarial + fuzz).
- Hechos nuevos registrados en ODA-ODS-DWG-5.4.1-PUBLIC: disposición de la
  cabecera, constantes XOR del CRC y centinela final. Límite conocido: esas
  constantes quedan pendientes de validación contra corpus real con derechos;
  hasta entonces la evidencia es el round-trip de laboratorio.
  **Actualización 2026-08-20**: el corpus real resolvió este límite en dos
  sentidos — la máscara XOR del CRC quedó **desmentida por corpus, corregida**
  (8/8 AC1015 reales guardan el CRC crudo; XOR observado 0x0000 con 6
  registros) y el centinela final quedó CONFIRMADO byte a byte. Ver
  `VALLE-CORPUS-AC1015-INTAKE-DAE5E77` y la sesión de intake de abajo.

## DWG-1 sesión 2026-08-14 (continuación) — writer del contenedor (fase C)

- Hechos nuevos registrados ANTES de derivar código en
  `ODA-ODS-DWG-5.4.1-PUBLIC`: centinelas de 16 bytes de las secciones de
  variables de cabecera y de clases (cierre = complemento a uno de la
  apertura), marco de sección tamaño RL + payload + CRC-16 semilla 0xC0C1
  little-endian, y páginas del mapa de objetos con tamaño y CRC big-endian
  (terminadora de tamaño 2 sin datos).
- Nuevo `src/container/ac1015-section-frame.ts`: `readAc1015SectionFrame`
  verifica el marco completo de una sección R2000 (centinela de apertura,
  tamaño RL con encaje EXACTO en su registro del directorio, CRC y centinela
  de cierre) y devuelve el payload OPACO; `readAc1015EmptyObjectMap` verifica
  la página terminadora big-endian y declara `unsupported` —no corrupto— un
  mapa poblado, que es de fases posteriores. Constantes de centinela y semilla
  exportadas para el writer.
- Nuevo `src/writer/ac1015-container-writer.ts`: `writeAc1015Container`
  produce el contenedor AC1015 mínimo determinista — cabecera con 3 registros
  (header-vars/classes/object-map) y CRC enmascarado, sección de variables de
  cabecera con placeholder confeso "VALLE-DWG0-HVARS", sección de clases
  vacía y mapa de objetos vacío. Importa magia, centinelas y máscaras de los
  MISMOS módulos que el lector (cero constantes gemelas); payloads del
  llamador inspeccionados y copiados una vez (SharedArrayBuffer rechazado),
  tope de payload de laboratorio y fallo cerrado en toda opción inválida.
- Nueva `tests/unit/ac1015-writer.spec.ts`: round-trip completo
  writer→`parseAc1015FileHeader`→lector de marcos→mapa vacío; determinismo;
  payloads opacos ida y vuelta; gemelos tristes torciendo los bytes del
  writer (CRC de marco con offset exacto, centinelas de apertura/cierre,
  centinelas de otra sección, tamaño que se sale o que sobra, extensiones
  imposibles, páginas de mapa malformadas y mapa poblado como unsupported).
- `tests/unit/ac1015-header.spec.ts` pasa a construir sus cabeceras con el
  writer real como fuente única del binario válido; los gemelos tristes
  mutan esos bytes y sólo el caso de 6 registros recompone el directorio
  quirúrgicamente reutilizando cabecera y centinela del writer.
- Límites conocidos: los centinelas de sección, la semilla 0xC0C1 por sección
  y la convención big-endian del mapa quedan pendientes de validación contra
  corpus real con derechos (fase de intake); la lectura estricta de que el
  registro del directorio cubre el marco COMPLETO (centinelas incluidos) es
  una decisión de laboratorio sostenida por el round-trip, no por corpus. El
  payload de variables de cabecera sigue siendo placeholder; su contenido
  real es de fases posteriores. El producto permanece `available:false`.

## DWG-1 sesión 2026-08-14 (continuación) — mapa de objetos poblado (fase D1)

- Hechos nuevos registrados ANTES de derivar código en
  `ODA-ODS-DWG-5.4.1-PUBLIC`: pares del mapa como delta de handle (entero
  modular SIN signo) y delta de offset (CON signo) cuyos acumuladores
  arrancan de 0 una sola vez al inicio de la SECCIÓN y sobreviven a los
  cortes de página; tope de página de 2032 bytes contando su campo de tamaño
  y sin partir ningún par; y envoltura de objeto = tamaño MS + datos (que
  abren con el tipo BS) + CRC-16 RS little-endian semilla 0xC0C1 sobre
  [tamaño+datos].
- Nuevo `src/container/ac1015-object-map.ts`: `readAc1015ObjectMap` lee el
  mapa COMPLETO — vacío o poblado — página a página (tamaño RS y CRC
  big-endian, semilla 0xC0C1 sobre la página entera incluido su tamaño,
  terminadora de tamaño 2) y devuelve la lista {handle, offset} validada:
  handles estrictamente crecientes (delta nulo = corrupción), offsets dentro
  del archivo y sin duplicados, topes `maxHandles`/`maxObjects` cobrados
  ANTES de acumular, y fallo cerrado en página malformada o >2032, CRC roto,
  deltas que desbordan el rango seguro, mapa sin terminadora y bytes de
  sobra. Los errores del decodificador de pares se TRASLADAN al offset real
  del archivo.
- Nuevo `src/container/ac1015-object-envelope.ts`: `readAc1015ObjectEnvelope`
  abre la envoltura de un objeto desde un offset del mapa — tamaño MS, cuerpo
  OPACO, CRC RS — extrayendo SOLO el tipo BS inicial. Verifica que la
  envoltura completa cabe en el archivo y no pisa ninguna extensión del
  directorio (el offset se comprueba ANTES de leer el tamaño). Decodificar el
  cuerpo es de la fase D2.
- Nuevo `src/writer/ac1015-object-writer.ts` + extensión del writer del
  contenedor: `writeAc1015Container({objects})` emite N objetos sintéticos
  CONFESOS (tipo BS + relleno determinista función pura del tipo y la
  posición + CRC) en la región sin mapear entre clases y mapa, y el mapa
  poblado con paginación real contra el MISMO tope que exige el lector.
  Espejos first-party de MC/MS/BS para emitir; con cero objetos el binario es
  byte a byte el de la fase C.
- Nueva `tests/unit/ac1015-object-map.spec.ts`: round-trip 0/1/3/100 objetos
  con handles y offsets EXACTOS (deltas multibyte incluidos), paginación
  real con 1200 objetos (2 páginas de datos + terminadora, acumuladores
  sobreviviendo al corte), delta de offset negativo válido, y gemelos
  tristes: CRC de página y de terminadora rotos (byte exacto), delta de
  handle nulo, offsets fuera/negativos/duplicados, delta desbordante, mapa
  sin terminadora, bytes de sobra, páginas imposibles (<2, >2032, fuera de
  sección), topes de `createDwgLimits` a la baja, envoltura truncada, CRC de
  envoltura roto (byte exacto), envoltura que pisa el directorio, tamaño
  cero y writer fallando cerrado ante specs inválidos.
- `npm run check` del paquete y `npm run check:dwg` desde la raíz: verdes.
- Límites conocidos: la continuación de los acumuladores a través de las
  páginas, el tope de 2032, la atomicidad de los pares por página y la
  convención little-endian del CRC de envoltura quedan pendientes de
  validación contra corpus real con derechos (fase de intake); hasta
  entonces la evidencia es el round-trip de laboratorio. Los cuerpos siguen
  OPACOS: tipo extraído, nada más decodificado. El producto permanece
  `available:false`.

## DWG-1 sesión 2026-08-14 (continuación) — primera geometría real (fase D2)

- Hechos nuevos registrados ANTES de derivar código en
  `ODA-ODS-DWG-5.4.1-PUBLIC`: códigos de tipo BS de las cuatro entidades
  nucleares (0x11 ARC, 0x12 CIRCLE, 0x13 LINE, 0x1B POINT), tamaño RL en
  bits del dato tras el tipo, orden de la cabecera común de entidad R2000,
  disposición de LINE (bit de Z nulas + RD/DD contra el inicio), de POINT
  (3BD + BT + BE + BD del eje X), de CIRCLE (3BD + BD radio + BT + BE) y de
  ARC (CIRCLE + BD de ángulos), y el flujo de handles del final del dato.
- Nuevo `src/model/entity-geometry.ts`: modelo geométrico NEUTRAL de las
  cuatro entidades (puntos 3D, grosor, extrusión, ángulos), sin banderas de
  formato y sin tocar `CadDocument` ni el producto.
- Nuevo `src/objects/entity-common.ts`: `readAc1015EntityCommon` decodifica
  del cuerpo (tipo BS incluido) el tamaño RL en bits, el handle propio H, el
  modo BB (0b11 = corrupción), reactores BL (con encaje contra el flujo de
  handles), bit de sin-vínculos, color CmC, escala BD, banderas BB de
  linetype/plotstyle, invisibilidad BS y lineweight RC. EED y gráfico de
  previsualización NO se interpretan: se recorren con presupuesto y quedan
  CONTABILIZADOS como tramos opacos `{kind, startBit, bitLength}` — nada se
  ignora en silencio.
- Nuevo `src/objects/entities-core.ts`: `decodeAc1015EntityBody` filtra el
  tipo ANTES de interpretar nada (un tipo ajeno a las cuatro es
  `DWG_VERSION_DECODER_UNSUPPORTED`, no corrupción: la disposición de otros
  cuerpos no se conoce y fingir el común sería desincronizarse), decodifica
  la geometría del tipo, exige que el tamaño en bits declarado CUADRE
  EXACTAMENTE con el final de los datos, y anota el flujo de handles final
  como tramo opaco. Doubles no finitos y radios negativos son corrupción
  (decisión de laboratorio declarada).
- Nuevo `src/writer/ac1015-entity-writer.ts`: `DwgBitEmitter` MSB-first
  espejo de `DwgBitReader` (BS/BL/RL/RD/BD/DD/BT/BE/H, atajos sólo con
  igualdad exacta de bits — un −0.0 viaja como RD completo) y
  `writeAc1015EntityBody` que compone en dos pasadas (el RL cuenta el propio
  RL) el cuerpo completo: común mínimo coherente (modo 2, 0 reactores, color
  ByLayer 256, escala 1.0, banderas 0, lineweight 0x1D) y flujo de handles
  con xdictionary y capa NULOS como placeholders confesos. El writer de
  contenedor acepta ahora entidades reales (`{entity, handle?}`) junto a los
  sintéticos D1, exigiendo que el handle del mapa y el del cuerpo sean el
  mismo, y `wrapAc1015ObjectBody` es el único marco de envoltura (cero
  marcos gemelos).
- Nueva `tests/unit/entities-core.spec.ts`: round-trip coordenada a
  coordenada de las cuatro entidades (positivas/negativas/cero, −0.0 bit a
  bit, Z no nulas, ángulos en los cuatro cuadrantes y negativos, extrusiones
  no canónicas, grosores negativos), común interpretado y opacos con
  posiciones exactas (EED y gráfico compuestos a mano), determinismo,
  pipeline completo mapa→envoltura→común→tipo con sintéticos conviviendo, y
  gemelos tristes: tipo desconocido (unsupported con categoría
  `unsupported`), común truncado en cuatro cortes, datos del tipo truncados,
  modo 0b11, bandera BL 0b11, reactores que no caben, bit-size que se sale,
  que se queda corto y que sobra, radio negativo y NaN.
- `npm run check` del paquete y `npm run check:dwg` desde la raíz: verdes.
- Certezas declaradas: ALTA en los códigos de tipo, el orden de los campos
  específicos de las cuatro entidades y la existencia del común
  (tipo→RL→H→EED→gráfico→modo→reactores→color→escala→banderas→invisibilidad
  →lineweight). MEDIA, pendiente de corpus real con derechos (fase de
  intake): que el RL cuenta desde el PRIMER bit del dato (y no desde después
  del propio RL), la posición exacta del bit de sin-vínculos, el código 0
  del handle propio, el flujo de handles arrancando exactamente en el bit
  declarado, y el byte 0x1D como lineweight ByLayer. Decisiones de
  LABORATORIO (no hechos del formato): modo 0b11 y doubles no finitos como
  corrupción, radio negativo como corrupción, y el writer emitiendo DD sólo
  en sus formas 00/11 (los parches de 4/6 bytes son compresión opcional que
  el lector ya acepta). El producto permanece `available:false`.

## DWG-1 sesión 2026-08-14 (continuación) — LWPOLYLINE, TEXT y tabla LAYER (fase D3)

- Hechos nuevos registrados ANTES de derivar código en
  `ODA-ODS-DWG-5.4.1-PUBLIC`: códigos de tipo 0x01 TEXT, 0x4D LWPOLYLINE,
  0x32 LAYER CONTROL y 0x33 LAYER; bandera BS de presencia de LWPOLYLINE
  (1 extrusión, 2 grosor, 4 ancho constante, 8 elevación, 16 recuento de
  bulges, 32 recuento de anchos, 512 cierre) con el primer vértice 2RD y los
  siguientes 2DD contra el anterior; RC de banderas de TEXT donde un bit a 1
  significa campo AUSENTE (elevación/alineación/oblicuo/rotación/factor/
  generación/alineaciones) con inserción 2RD, extrusión BE, grosor BT,
  altura RD y cadena TV incondicionales; prólogo común de los objetos de
  tabla (tipo→RL→H→EED→reactores BL, sin gráfico ni modo); entrada LAYER
  (nombre TV, bandera 64, xrefindex+1 BS, bit de dependencia, BS de estado
  empaquetado, color CmC, ltype/plotstyle por handle) y CONTROL con recuento
  de entradas BL y sus handles en el flujo final.
- `entity-common.ts` refactorizado sin cambiar semántica: el arranque del
  prólogo (`readAc1015ObjectPrologue`) y las utilidades `finiteDecoded`/
  `readFiniteExtrusion`/`assertHandleCountFits` se comparten entre entidades
  y objetos de tabla — cero criterios gemelos.
- Nuevo `src/objects/entities-poly.ts`: `decodeLwPolyline` con fallo cerrado
  en recuentos que no caben (cobrados ANTES de reservar), recuentos de
  bulges/anchos desalineados de los vértices, anchos negativos y doubles no
  finitos; un bit de bandera NO modelado (p. ej. 0x80) es
  `DWG_VERSION_DECODER_UNSUPPORTED`, no corrupción. TEXT en
  `entities-core.ts` con ausencia modelada como `undefined` (0 explícito ≠
  ausente) y la cadena como BYTES + longitud declarada (página de códigos de
  capa superior). El despachador cubre ahora seis tipos.
- Nuevo `src/objects/table-layer.ts`: común de objeto de tabla, LAYER
  (nombre en bytes, campos de xref, BS de estado CRUDO, color CmC) y LAYER
  CONTROL (recuento de entradas BL validado contra el flujo, junto a los
  reactores); tamaño en bits exigido EXACTO y flujo de handles contabilizado
  opaco, como en las entidades.
- Writer espejo: `emitTV` y los emisores de LWPOLYLINE/TEXT en
  `ac1015-entity-writer.ts` (banderas DERIVADAS de la presencia de cada
  campo; atajos DD sólo con igualdad exacta de bits — lo no representable
  viaja como RD literal); nuevo `src/writer/ac1015-table-writer.ts` con los
  cuerpos de LAYER y CONTROL (flujos de handles nulos como placeholders
  CONFESOS; entradas del control como referencias absolutas código 2). El
  contenedor acepta specs `{layer}` y `{layerControl}` junto a entidades y
  sintéticos, exigiendo UNA sola naturaleza por spec.
- Nuevas `tests/unit/entities-poly.spec.ts` y `tests/unit/table-layer.spec.ts`
  (205 unit en total): round-trips exactos de LWPOLYLINE
  (abierta/cerrada/bulges/anchos/opcionales/120 vértices con deltas DD
  variados y −0.0 bit a bit), TEXT (todo presente/todo ausente/cadena
  vacía/300 bytes con valores altos), LAYER y CONTROL (nombres con bytes
  altos, colores 0/7/255/256, banderas crudas); la meta de la fase — un
  contenedor con control + capa "0" + entidades cuyo lector recupera nombre
  y color exactos — y gemelos tristes: banderas no modeladas, recuentos
  imposibles o desalineados, anchos/alturas negativos, TV que se sale,
  truncados dentro del dato declarado, descuadres de bit-size y filtros
  cruzados entre decodificadores (tipo ajeno = unsupported).
- `npm run check` del paquete y `npm run check:dwg` desde la raíz: verdes
  (205 unit + 349 adversarial + fuzz determinista).
- Certezas declaradas: ALTA en los cuatro códigos de tipo nuevos, en la
  estructura general de LWPOLYLINE (bandera→opcionales→recuentos→vértices
  2RD/2DD→bulges→anchos) y en el RC de presencia invertida de TEXT. MEDIA,
  pendiente de corpus real con derechos (fase de intake): el orden exacto
  ancho constante→elevación→grosor→extrusión de LWPOLYLINE, la codificación
  BE (y no 3BD) de su extrusión tras la bandera, el orden
  elevación→inserción de TEXT, los campos xref de la entrada LAYER
  (bandera 64, xrefindex+1, dependencia) y el recuento BL (y no BS) del
  CONTROL. Decisiones de LABORATORIO (no hechos del formato): recuentos de
  bulges/anchos distintos del de vértices como corrupción, anchos y alturas
  negativos como corrupción, bits de bandera no modelados de LWPOLYLINE
  (p. ej. generación de tipo de línea 0x80 y vertexids R2010+) como
  unsupported, y la semántica bit a bit del BS de estado del LAYER SIN
  interpretar (viaja crudo en el modelo hasta validarla contra corpus). Los
  flujos de handles siguen opacos y contabilizados; resolver referencias
  entre objetos (capa de una entidad, entradas del control) es de una fase
  posterior. El producto permanece `available:false`.

## DWG-1 sesión 2026-08-14 (continuación) — INSERT, tabla de bloques y el ensamblado (fase D4)

- Hechos nuevos registrados ANTES de derivar código en
  `ODA-ODS-DWG-5.4.1-PUBLIC`: códigos de tipo 0x04 BLOCK, 0x05 ENDBLK,
  0x07 INSERT, 0x30 BLOCK CONTROL y 0x31 BLOCK HEADER; los datos del INSERT
  (inserción 3BD, doble bandada BB de escalas — 00 X como RD con Y/Z en DD
  contra la X, 01 X = 1.0 con Y/Z en DD contra 1.0, 10 un único RD uniforme,
  11 las tres escalas 1.0 —, rotación BD, extrusión BE y bit de ATTRIBs); la
  cabeza del flujo de handles de entidad (propietario según el modo,
  reactores, xdictionary, capa) con el hard pointer del INSERT a su BLOCK
  HEADER tras ella; la entrada BLOCK HEADER (nombre TV, campos de xref, bits
  de anónimo/ATTDEFs/es-xref/superpuesto, punto base 3BD, ruta TV, secuencia
  RC de recuentos de inserción terminada en 0, descripción TV y
  previsualización con tamaño BL, con los punteros a la entidad BLOCK,
  primera/última entidad y ENDBLK en su flujo final); y el control de
  bloques con model/paper space fuera del recuento.
- Nuevo `src/objects/entity-insert.ts`: `decodeInsert` con las cuatro formas
  de la bandada de escalas; el writer emite SOLO 00/11 (como con DD, lo
  dudoso se acepta al leer y no se emite). La bandera de ATTRIBs viaja en el
  modelo (`attributesFollow`); decodificar o emitir ATTRIBs es pendiente
  DECLARADO — el writer falla cerrado si el modelo la pide.
- `entity-common.ts` ampliado con la MISMA disciplina de tramos
  contabilizados: `readAc1015EntityHandleHead` interpreta la cabeza del
  flujo (propietario/xdictionary/capa/ltype/plotstyle, resueltos contra el
  handle propio) SIN sustituir el tramo opaco, que sigue anotado entero. El
  despachador de `entities-core.ts` la aplica a las siete entidades y, en un
  INSERT, extrae además el hard pointer al BLOCK_RECORD; `references` viaja
  en el resultado decodificado.
- Nuevo `src/objects/table-block.ts`: BLOCK_RECORD (nombre, banderas, punto
  base, previsualización contabilizada como tramo `graphic`), su CONTROL
  (reutilizando el común y el cierre EXPORTADOS de `table-layer.ts` — cero
  gemelos) y las entidades BLOCK (nombre TV) y ENDBLK (sin campos).
- Writer espejo: `src/writer/ac1015-block-writer.ts` (registro, control con
  dos nulos finales confesos, BLOCK/ENDBLK en modo 0 con propietario);
  `writeAc1015EntityBody` acepta `{ownerBlockHandle, insertBlockHandle}` —
  una entidad con dueño viaja en modo 0 con el propietario abriendo su
  flujo; el INSERT exige su bloque o falla cerrado. La composición de
  cuerpos y el común de entidad quedaron EXPORTADOS únicos
  (`composeAc1015ObjectBody`, `emitAc1015EntityCommonTail`) y el contenedor
  acepta las cuatro naturalezas nuevas manteniendo UNA naturaleza por spec.
  `DwgBitEmitter` se movió SIN cambios a `src/writer/dwg-bit-emitter.ts`
  (presupuesto de 800 líneas del monorepo) y se re-exporta desde el writer
  de entidades para conservar la superficie de las fases anteriores.
- ENSAMBLADO — nuevo `src/reader/ac1015-database-reader.ts`:
  `readAc1015Database(bytes, limits?)` orquesta firma → cabecera → marcos de
  variables/clases → mapa → envoltura → común → decodificador por tipo, con
  `createDwgLimits` y presupuesto cobrado por byte Y por objeto (el cuerpo
  se cobra otra vez al decodificarlo). Devuelve la base neutral
  `{layers, blocks, modelSpaceEntities, unsupported, diagnostics}`: los
  tipos no decodificados se ENUMERAN `{handle, type}` — jamás descartados
  en silencio —, la pertenencia entidad→bloque se resuelve por el
  PROPIETARIO del común contra los BLOCK_RECORD, y el INSERT resuelve su
  bloque a nombre. Propietario desconocido → model space con diagnóstico;
  INSERT sin bloque → diagnóstico de error; BLOCK/ENDBLK sueltos o con
  nombre torcido → diagnóstico; un handle de cuerpo que no coincide con su
  entrada del mapa → corrupción (decisión de laboratorio).
- Nuevas `tests/unit/entity-insert.spec.ts`, `tests/unit/table-block.spec.ts`
  y `tests/unit/ac1015-database.spec.ts` (236 unit en total): la meta de la
  fase — un contenedor con 2 capas, 1 bloque "PUERTA" con BLOCK + LINE +
  CIRCLE + ENDBLK y un model space con POINT, ARC e INSERT del bloque, cuya
  base recupera la estructura EXACTA con la referencia del INSERT resuelta
  por nombre —, determinismo bytes-y-estructura, las formas de escala 01/10
  aceptadas sin emitirse, referencia relativa de bloque resuelta contra el
  handle propio, y gemelos tristes: INSERT a bloque inexistente
  (diagnóstico `error`, no silencioso), propietario desconocido (model
  space + diagnóstico), BLOCK ajeno y nombre torcido (diagnósticos), tipos
  no soportados enumerados junto a los decodificados, límites bajos
  (`maxObjects`, `maxWorkUnits`, `maxFileBytes`) con error tipado de
  recursos, flujos que no alcanzan para el handle del bloque, truncados,
  descuadres de bit-size y filtros cruzados.
- `npm run check` del paquete y `npm run check:dwg` desde la raíz: verdes
  (236 unit + 349 adversarial + fuzz determinista).
- Certezas declaradas: ALTA en los cinco códigos de tipo nuevos, en el orden
  general del dato del INSERT y en sus formas de escala 00/11, y en que el
  BLOCK sólo lleva su nombre tras el común. MEDIA, pendiente de corpus real
  con derechos (fase de intake): la asignación exacta de las formas de
  escala 01/10, la posición del bit de ATTRIBs tras la extrusión, el ORDEN
  de la cabeza del flujo de handles (propietario→reactores→xdictionary→capa)
  y que el hard pointer del INSERT va justo tras ella, el orden de los
  campos intermedios del BLOCK HEADER (recuentos de inserción, descripción,
  previsualización), los punteros primera/última entidad y su flujo, que
  ENDBLK carece de campos propios, y los registros model/paper space del
  control de bloques fuera del recuento. Decisiones de LABORATORIO (no
  hechos del formato): el código 4 para el propietario emitido y el 5 para
  los punteros de bloque (el lector acepta 2–5 como absolutas), la
  disposición exacta del flujo emitido del BLOCK_RECORD (placeholder
  confeso, contabilizado sin interpretarse), el descuadre mapa/cuerpo como
  corrupción, el modo 1 (paper space) y los propietarios no resueltos
  conservados en model space CON diagnóstico, y el orden de la base = orden
  del mapa. Los ATTRIBs del INSERT y la interpretación de los punteros
  primera/última entidad quedan pendientes declarados. El producto
  permanece `available:false`.

## Intake sesión 2026-08-20 — ola E2: el corpus real corrige el codec

Primer ciclo del bucle de intake del ADR-0007 sobre el corpus admitido
(commit `dae5e77`, 40 DWG generados por ODA File Converter 27.1 desde DXF
propios). Disciplina: cada hecho de formato descubierto por diffing se
registra PRIMERO en `SOURCE_REGISTER.json` como observación first-party y
sólo después se toca el código. Un commit por hecho.

### Hecho 1 — CRC de cabecera SIN máscara XOR (desmentido por corpus, corregido 2026-08-20)

- Certeza previa (fase B, MEDIA): el CRC de la cabecera se enmascara con la
  constante XOR del recuento de registros (3→0xA598, 4→0x8101, 5→0x3CC4,
  6→0x8461), hecho tomado de la ODS 5.4.1. Evidencia hasta hoy: round-trip
  de laboratorio.
- Observación (`VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): los 8 AC1015
  reales declaran 6 registros y guardan en el offset 79 el CRC-16 crudo
  (semilla 0xC0C1 sobre los bytes [0,79)); el XOR necesario para cuadrar es
  0x0000 en los 8. La máscara 0x8461 queda **desmentida por corpus,
  corregida**. Ningún archivo real exhibe 3–5 registros y los 32 DWG de
  otras versiones no comparten esta cabecera: las máscaras 0xA598/0x8101/
  0x3CC4 quedan sin evidencia real en ningún sentido.
- Decisión: el laboratorio abandona la máscara ENTERA — el lector valida el
  CRC crudo para todo recuento 3–6 y el writer lo emite crudo, COHERENTES.
  Mantener máscaras sin evidencia sólo en los recuentos que ningún archivo
  real exhibe habría preservado una tabla cuya única entrada comprobable
  resultó falsa. El rango 3–6 del recuento se conserva (hecho no
  contradicho). Si algún día un archivo real con 3–5 registros no cuadra,
  el harness lo caracterizará como hoy caracterizó éste.
- Confirmaciones de regalo de la misma medición: el centinela final de la
  cabecera coincide byte a byte en los 8, y los registros id 0/1 cubren el
  marco COMPLETO de su sección (tamaño RL = tamaño del registro − 38, con
  los centinelas de apertura registrados en su sitio) — la "decisión de
  laboratorio" del encaje exacto de fase C es ahora un hecho confirmado
  por corpus para esas dos secciones.
- Nota de registro: la entrada nació como
  `VALLE-CORPUS-AC1015-HEADER-CRC-2026-08-20` y se renombró a
  `VALLE-CORPUS-AC1015-INTAKE-DAE5E77` en el hecho 2 — el registro exige
  ubicaciones de origen únicas, así que los hechos medidos sobre el MISMO
  commit del corpus se acumulan en una sola entrada, igual que los de la ODS.

### Hecho 2 — BLOCK HEADER lleva un bit extra antes del punto base (desmentido por corpus, corregido 2026-08-20)

- Certeza previa (fase D4, con el orden intermedio marcado MEDIA): la
  entrada BLOCK HEADER codifica ... bits de anónimo/ATTDEFs/es-xref/xref
  superpuesto, punto base 3BD, ruta TV, recuentos RC, descripción TV y
  previsualización BL.
- Síntoma tras el hecho 1: los 8 archivos morían SOLO en sus BLOCK HEADER
  (`*Model_Space`/`*Paper_Space` y los bloques de usuario), con
  `DWG_STRUCTURE_CORRUPT` al final del cuerpo — la secuencia de recuentos
  RC leía basura desalineada hasta salirse. Todos los demás tipos cubiertos
  (LINE incluida) ya decodificaban.
- Observación (18/18 BLOCK HEADER de los 8 archivos, registrada en
  `VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): entre el bit de xref-superpuesto y
  el punto base viaja UN bit adicional (observado 0 en los 18). Sin él, el
  punto base decodifica (1,1,1) y todo lo posterior se desalinea; con él,
  el punto base es (0,0,0), la ruta vacía, los recuentos de inserción
  reales aparecen ([1,1,1,1] en MARCO-A, [1,1] en PUERTA) y el flujo de
  handles arranca EXACTAMENTE en el bit declarado (197/197, 189/189,
  165/165). Los bytes discriminan solos entre las dos disposiciones.
- Decisión: el lector lee el bit y lo expone CRUDO en el modelo
  (`postXrefFlagsBit`) sin interpretar su semántica — ninguna fuente
  registrada la nombra —, y el writer lo emite en 0, el único valor
  observado. Mismo trato que el BS de estado del LAYER: viaja sin
  interpretación hasta que una fuente o el corpus la fijen.
- Confirmaciones de regalo de la misma medición: el RL de tamaño cuenta
  desde el PRIMER bit del dato (certeza MEDIA de D2, ahora confirmada con
  archivos reales), la secuencia RC de recuentos termina en 0 con valores
  reales distintos de cero, y las convenciones big-endian del mapa de
  objetos y little-endian del CRC de envoltura (MEDIA de D1) quedan
  confirmadas — los 8 mapas reales (168–169 objetos) y todas sus
  envolturas validan.

### Hecho 3 — la extrusión del INSERT es 3BD, no BE (desmentido por corpus, corregido 2026-08-20)

- Certeza previa (fase D4, orden general del dato marcado ALTA): datos del
  INSERT = inserción 3BD, bandada BB de escalas, rotación BD, **extrusión
  BE** y bit de ATTRIBs.
- Síntoma tras el hecho 2: 6 de 8 archivos abren con TODA su geometría
  correcta contra el oráculo; los dos con INSERT mueren con «declared bit
  size does not match» en cada uno de sus 6 INSERT, siempre 5 bits corto.
- Observación (6/6 INSERT de 07/08, registrada en
  `VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): la extrusión viaja como **3BD**.
  Con la extrusión canónica (0,0,1), BE gasta 1 bit y 3BD gasta 6 — los 5
  bits que faltaban. Con 3BD los 6 cuerpos aterrizan el flujo de handles
  EXACTAMENTE en el bit declarado (229/229, 293/293, 425/425, 425/425,
  229/229, 293/293) y los valores decodificados son los del dibujo:
  inserciones (10,10,0)/(50,10,0)/(90,10,0)/(10,40,0)/(60,55,0)/(60,35,0)
  y rotaciones 0.5236 y 1.5708 rad.
- Decisión: lector y writer pasan a 3BD JUNTOS. La nota de que otras
  entidades usan BE no se toca: LINE/CIRCLE/ARC/TEXT/LWPOLYLINE reales ya
  decodifican exactos con BE, así que el corpus la confirma para ellas.
- Confirmaciones de regalo: la bandada de escalas con datos reales —
  0b11 = tres 1.0 (4 casos) y 0b00 = X RD con Y/Z DD contra X (escalas
  (2,1.5,1) y (0.5,0.5,1)). Las formas 0b01/0b10 siguen sin observarse:
  el lector las conserva y el writer sigue sin emitirlas.
