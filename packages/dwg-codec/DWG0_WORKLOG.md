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
  **Actualización 2026-08-20**: el corpus real CONFIRMÓ los centinelas de
  las secciones 0/1, la semilla por sección, la convención big-endian del
  mapa y el encaje exacto del marco (tamaño RL = registro − 38) — ver la
  sesión de intake.

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
  **Actualización 2026-08-20**: los 8 mapas reales (168–194 objetos por
  archivo) y TODAS sus envolturas validan con estas convenciones — ver la
  sesión de intake. El tope de 2032 no llegó a tensarse con este corpus.

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
  declarado, y el byte 0x1D como lineweight ByLayer.
  **Actualización 2026-08-20**: el corpus real CONFIRMÓ el conteo del RL
  desde el primer bit, el código 0 del handle propio y el arranque exacto
  del flujo de handles; el bit de sin-vínculos resultó gobernar DOS
  punteros del flujo (hecho 4 de la sesión de intake). Decisiones de
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
  control de bloques fuera del recuento.
  **Actualización 2026-08-20**: el corpus real DESMINTIÓ dos piezas — la
  extrusión BE del INSERT (es 3BD, hecho 3) y la cabeza del flujo sin
  punteros anterior/siguiente (viajan con sin-vínculos a 0, hecho 4) — y el
  BLOCK HEADER lleva un bit extra antes del punto base (hecho 2). CONFIRMÓ
  las formas de escala 00/11 con valores reales, el orden de los campos del
  BLOCK HEADER corregido, el hard pointer del INSERT tras la cabeza, que
  ENDBLK no lleva campos propios y el orden restante de la cabeza del
  flujo. Las formas 01/10 siguen sin observarse. Ver la sesión de intake. Decisiones de LABORATORIO (no
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

### Hecho 4 — sin-vínculos a 0 = punteros anterior/siguiente en el flujo (desmentido por corpus, corregido 2026-08-20)

- Certeza previa (fase D4, MEDIA): la cabeza del flujo de handles es
  propietario (modo 0) → reactores → xdictionary → capa, y el "bit de
  sin-vínculos" era un bit del común sin efecto en el flujo.
- Síntoma tras el hecho 3: los 8 abren; 4 de 6 INSERT perfectos. Los DOS
  únicos objetos del corpus con el bit de sin-vínculos a 0 (INSERT 42 y 45
  de 07) leen su geometría exacta pero su "capa" y su "bloque" salen de
  handles equivocados: el flujo trae MÁS handles de los que la cabeza
  esperaba, y precisamente en el primero y el último objeto del dibujo.
- Observación (bit a bit, registrada en
  `VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): con el bit a 0 viajan DOS handles
  entre el xdictionary y la capa — los punteros a la entidad ANTERIOR y
  SIGUIENTE de la lista enlazada. En el INSERT 42 (primero): anterior nulo
  (código 4, contador 0) y siguiente propio+1 (código 6) → 43; en el 45
  (último): anterior propio−1 (código 8) → 44 y siguiente nulo. Tras
  ellos, la capa (5→16) y el bloque (5→35, MARCO-A) decodifican en su
  sitio. La lista enlazada explica que sean exactamente el primero y el
  último los que llevan el bit a 0 en este corpus.
- Decisión: `readAc1015EntityHandleHead` consume los dos punteros cuando el
  común declara el bit a 0 y los expone RESUELTOS
  (`previousEntity`/`nextEntity`); el orden de la base sigue siendo el del
  mapa (no se reordena por la lista — decisión de laboratorio declarada).
  El writer sigue emitiendo el bit a 1 (sin punteros), forma que el corpus
  también exhibe en todos los demás objetos.

### Veredicto de la ola E2 (2026-08-20)

Cuatro hechos registrados y corregidos, un commit por hecho. Tras el cuarto:

- **8/8 DWG AC1015 reales abren** y el harness emite la matriz completa
  contra los oráculos DXF: **35/35 entidades leídas con geometría exacta**
  (line 15/15, insert 6/6, circle 3/3, arc 2/2, point 1/1, lwpolyline 3/3,
  text 5/5), capas 7/7 y 5/5 con nombre y color exactos, bloques MARCO-A y
  PUERTA encontrados con contenido correcto. **Cero discrepancias.**
  Evidencia: `docs/cad/evidence/dwg-corpus-validation.json`.
- 40/40 no: los 32 DWG de AC1018/AC1024/AC1027/AC1032 usan otro contenedor
  y este decoder ni los intenta — frontera conocida, no una sorpresa.
- Fronteras abiertas que este corpus dejó a la vista, ninguna bloqueante:
  los marcadores BLOCK/ENDBLK de `*Model_Space`/`*Paper_Space` viajan en
  modo 2/1 SIN propietario en el flujo y quedan «recorded but not attached»
  (4 warnings honestos por archivo; atarlos exige interpretar los punteros
  del flujo del BLOCK_HEADER, hoy opacos con certeza MEDIA); los 159–172
  objetos por archivo de tipos no decodificados (diccionarios 0x2A, estilos,
  linetypes, 0x4F, 0x1F4–0x1FF…) siguen ENUMERADOS como `unsupported`; los
  `stateFlags` de capa siguen crudos (1009 con frozen declarado, 1016 con
  locked declarado — la semántica bit a bit sigue sin fuente registrada);
  las formas de escala 0b01/0b10 del INSERT y los recuentos 3–5 de
  registros de cabecera siguen sin observarse en archivo real alguno.
- Los estados de la matriz de capacidades NO cambian en esta ola: la
  promoción sigue gobernada por la regla de `CORPUS_POLICY.md` y la
  disponibilidad en producto sigue `false`.

## Campana DWG propio — sesion 2026-08-21 (olas 0 a 5)

Ocho horas en cascada con tres frentes paralelos. Cada hecho nuevo quedo
registrado ANTES de derivar codigo (SOURCE_REGISTER: la entrada de la ODS
crece a 80 hechos tras consultar su texto integro — descarga publica
oficial, consulta local fuera del repo — y nace VALLE-CORPUS-INTAKE-A60EBE2
con 12 mediciones first-party). Resumen por ola; el detalle vive en
docs/history/execution/CAMPANA_DWG_20260821.md y la evidencia en docs/cad/evidence.

- OLA 0 — API honesta: probeDwg gana la variante de EXITO, readDwg y
  writeDwg salen al indice, AC1015 declara experimental-lab en el registro
  de versiones, fixtures/fuzz/benchmark declaran el exito esperado.
- OLA 1 — lectura AC1015 completa para el corpus: el repo hermano gana los
  dibujos 16-25 (bundle entity-wave-2-ac1015, 25 DWG AC1015 en total) y el
  decoder cubre TODA entidad presente: anotacion (MTEXT, ATTRIB/ATTDEF/
  SEQEND atados a su INSERT, las siete DIMENSION, LEADER, TOLERANCE),
  polilineas clasicas con VERTEX, ELLIPSE/SPLINE, SOLID/TRACE/3DFACE,
  RAY/XLINE, MLINE, VIEWPORT y HATCH con islas; tablas de simbolos,
  diccionarios con entradas resueltas, XRECORD, clases y LAYOUT (los
  unsupported caen de ~160 a 32 por archivo, todos con nombre de clase);
  variables de cabecera decodificadas COMPLETAS con emisor espejo en
  round-trip exacto. Matriz diferencial: 25/25 abren, 0 discrepancias.
  Correcciones medidas a la ODS: cola BS+B+B del LEADER, byte extra del
  DIMSTYLE CONTROL, area de texto de 256 bytes siempre presente del LTYPE.
- OLA 2 — contenedor familia 2004: 32/32 DWG reales de AC1018/24/27/32
  abren su contenedor (descifrado con CRC32, mapas, descompresion LZ77 con
  presupuesto) y las cuatro secciones AcDb:* se localizan y descomprimen.
  Seis mediciones corrigieron a la propia ODS (byte del generador XOR,
  cabecera de pagina de datos con suma Fletcher en dos etapas, offsets de
  copia -1, dos bytes tras el terminador, nombres fijos de 64 bytes).
  Los cuerpos de objeto de la familia son la ola en curso.
- OLA 3 — escritura con oraculo externo: writeAc1015MinimalFile emite el
  archivo COMPLETO (6 registros, AuxHeader, variables reales, clases, 34
  objetos del esquema canonico medido, mapa, ObjFreeSpace, second header
  bit a bit, Template) y el ODA File Converter 27.1 acepta 4/4 casos sin
  error con coincidencia campo a campo. El oraculo pidio tres cosas, las
  tres medidas y registradas: byte del control DIMSTYLE, posiciones de la
  lista enlazada (sin ellas un lector ajeno solo ve la primera entidad) y
  el hard pointer al STYLE de todo TEXT. Sin TrustedDWG, jamas.
- OLA 4 — mapeo canonico puro con tipos espejo del esquema 9 y manifiesto
  de perdidas en ambos sentidos; tablas proyectadas con patrones .lin
  exactos; ADR-0009 redactado con el checklist de gates.
- OLA 5 — blindaje: 1200 mutaciones estructurales de DWG reales con 0
  fallos de invariante; 8 propiedades encode/decode de bitcodes; benchmark report-only (0.69 MB/s y 298 objetos/s tras la fase D5, maquina declarada).

El producto permanece available:false; la promocion es la firma del
ADR-0009, no un efecto colateral de esta campana.

## Intake 2026-08-23 — AC1024: dos hechos confirmados, BOT queda BLOCKED_BY_SOURCE_GATE

Objetivo de la sesion: decodificar cuerpos de objeto AC1024 (R2010). El hecho
ya registrado en `ODA-ODS-DWG-5.4.1-PUBLIC` ("AC1024/AC1027/AC1032... codifican
el tipo de objeto como par de 2 bits + valor (BOT) y el tamano del flujo de
handles como UMC tras el dato") nombra el mecanismo pero no fija su disposicion
exacta de bits — no hay tabla de que selector de 2 bits implica que ancho de
valor, a diferencia de BS/BL que si la tienen registrada. Sin esa tabla no hay
forma de decodificar NINGUN tipo de objeto sin adivinar.

Disciplina seguida: medicion original sobre el corpus admitido (commit
`a60ebe2`, bundles `valle.fundacional.ac1024.001`/`.ac1027.001`), permitida por
`CLEAN_ROOM_POLICY.md` ("mediciones originales realizadas sobre fixtures
autorizados"). Nunca se consulto una implementacion, SDK o especificacion
ajena no registrada.

**Hecho 1 — marco de seccion de datos R2010+ de 8 bytes de tamano** (registrado
en `VALLE-CORPUS-INTAKE-A60EBE2`, commit `75c2467`): a diferencia de R2000/
AC1018 (RL de 4 bytes), AcDb:Header y AcDb:Classes usan un campo de tamano de
8 bytes little-endian. Confirmado por coincidencia EXACTA del CRC-16
almacenado en 7/7 mediciones (AC1024 x2 fixtures x2 secciones, AC1027 y AC1032
x1 fixture x2 secciones). `readR2004SectionFrame` acepta ahora `sizeFieldWidth`
(4 u 8).

**Hecho 2 — envoltura de objeto R2010+ sin tamano al frente** (registrado en la
misma entrada, commit `f644321`): a diferencia de R2000/AC1018 (tamano MS +
cuerpo + CRC-16), el cuerpo NO lleva tamano en bytes al frente; el CRC-16
cubre el cuerpo completo desde su primer byte y termina exactamente 2 bytes
antes del offset del SIGUIENTE objeto del mapa de handles (o el fin del
payload para el ultimo). Medido por busqueda exhaustiva del rango candidato:
coincidencia UNICA y aterrizaje EXACTO en 430/430 objetos reales (148/148 en
AC1024 02-una-linea, 165/165 en AC1024 08-plano-mini, 117/117 en AC1027
08-plano-mini). Nuevo `container/r2010-object-envelope.ts`
(`pairR2010ObjectBounds` + `readR2010ObjectBody`) delimita y verifica el
cuerpo opaco; NO decodifica su tipo.

**Identificacion independiente de una LINEA real** (misma entrada): dentro de
ese envoltorio, el objeto handle=34 de `02-una-linea.dwg` (AC1024) se
identifico como la entidad LINEA del oraculo DXF (extremo 100,50,0) por
busqueda BIT A BIT (no alineada a byte) de los dobles IEEE-754 100.0 y 50.0:
ambos aparecen en las posiciones que predice el orden YA REGISTRADO de los
campos de LINEA en R2000 (Z-nulas, RD X0, DD X1, RD Y0, DD Y1) — el hueco de
64 bits entre los dos DD es exactamente un RD (Y0=0.0). Esto confirma que la
codificacion POR CAMPO de la geometria no cambia para R2010+.

**BOT — intentado y NO resuelto, declarado bloqueado.** Con el objeto LINEA ya
identificado, se localizo su handle propio H (patron codigo=0/contador=1/
valor=34, coincidencia UNICA a nivel de bit) 34 bits despues del inicio del
cuerpo. Se probaron las descomposiciones mas simples de esos 34 bits en
selector BOT de 2 bits + valor de ancho fijo (8, 16 y 32 bits, ambos ordenes
de bit ya establecidos en el codec): NINGUNA reproduce el codigo LINE=0x13 ya
registrado y confirmado para R2000/AC1018. Sin una fuente registrada que fije
la tabla selector→ancho de BOT (ni la posicion exacta del campo UMC del
tamano del flujo de handles, que depende de resolver BOT primero), continuar
exigiria adivinar una disposicion de bits — la regla mas importante del
laboratorio lo prohibe explicitamente. Se detiene ESTA linea de trabajo.

**Efecto en el producto**: ninguno observable. `readR2004Database` sigue
lanzando `DWG_VERSION_DECODER_UNSUPPORTED` para AC1024/AC1027/AC1032 antes de
llegar a los nuevos modulos (no estan conectados: conectar un envoltorio que
no puede identificar el TIPO no aportaria una base de datos, solo una lista de
cuerpos opacos sin clasificar). `DWG_VERSION_REGISTRY` mantiene
`decoderStatus: "unsupported"` para las tres versiones y `CAPABILITIES.md` no
cambia su estado, solo su columna de evidencia.

**Para retomar esta linea**: la unica entrada que faltaria en
`SOURCE_REGISTER.json` es la tabla exacta selector-de-2-bits→ancho-de-valor de
BOT (y, tras eso, la posicion exacta del campo UMC y el algoritmo del flujo de
strings separado). Esa tabla no es derivable por medicion pura sin mas
anclas independientes que una sola entidad conocida; hacen falta mas
identificaciones independientes (mas tipos, no solo LINE) para acotar el
espacio de hipotesis sin adivinar, o una fuente documental que la registre.

## Intake 2026-08-31 — BOT y UMC RESUELTOS por medición (VALLE-CORPUS-R2010-OBJECT-HEADER)

El intake de 2026-08-23 cerró su seccion diciendo exactamente que hacia falta
para retomar la linea: *"hacen falta mas identificaciones independientes (mas
tipos, no solo LINE) para acotar el espacio de hipotesis sin adivinar"*. Esas
identificaciones ya estaban en el corpus admitido y nadie las habia usado.
Este intake las usa. No hay fuente documental nueva: no se consulto ninguna
implementacion ajena ni ninguna especificacion que no estuviera ya registrada.

**El ancla que faltaba.** Los cinco bundles fundacionales son LOS MISMOS OCHO
DIBUJOS convertidos a cinco contenedores desde un DXF fuente byte-identico.
AC1015 ya se decodifica con cero discrepancias, asi que su envoltura da el
tipo esperado de CADA handle, no de uno. Son 2893 objetos con la respuesta
conocida de antemano repartidos en 24 fixtures y tres versiones. Con la
respuesta conocida la codificacion deja de adivinarse y se RESUELVE.

**Por que fallo el sondeo anterior.** Localizo el handle propio del LINE 34
bits despues del inicio del cuerpo —posicion CORRECTA, confirmada aqui— y
descompuso esos 34 bits como selector BOT de 2 bits mas un valor de ancho
fijo. La descomposicion no podia cerrar porque delante del BOT hay DOS campos
mas, no ninguno: el tamano del objeto y el tamano del flujo de handles. El
propio modulo `r2010-object-envelope.ts` nombraba el segundo como incognita
("la posicion exacta del campo UMC"), pero lo buscaba DESPUES del tipo cuando
va ANTES.

**La estructura medida.** El cuerpo de un objeto R2010+ abre asi:

1. `MS`  tamano del objeto en bytes (palabras LE de 16 bits, bit 15 continua);
2. `UMC` tamano EN BITS del flujo de handles (bytes de 7 bits utiles). Es un
   TAMANO, no un desplazamiento;
3. `BOT` tipo de objeto: selector de 2 bits; selector 0 → `RC` literal;
   selector 1 → `RC` mas 0x1F0;
4. `H`   handle propio, pegado detras del BOT sin campo intermedio.

Con el prefijo de un solo byte de `UMC` el BOT cae en el bit 24 (2723 objetos)
y con dos bytes en el bit 32 (170 objetos).

**Falsacion.** La primaria no depende de ninguna hipotesis sobre el tipo: el
handle propio viaja pegado detras del BOT y el mapa de handles ya dice cual
debe ser. Un ancho equivocado en cualquiera de los tres campos previos lo
desalinearia y saldria basura. Sale EXACTO en **2893/2893** objetos. La
secundaria, independiente de la primera, compara el tipo con el del gemelo
AC1015: **1353/1413** comparaciones de tipo FIJO, con **AC1027 351/351 y
AC1032 351/351 sin una sola discrepancia**. Las 60 restantes son todas AC1024
y todas del par DICTIONARY(0x2A)/XRECORD(0x4F) en handles contiguos: el
conversor los numero en orden distinto en cada version, de modo que el gemelo
no es la misma pieza. Los tipos por encima de 0x1F0 son numeros de clase que
cada archivo asigna en su propia seccion y no se comparan entre archivos.

**Lo que se declara SIN observar.** Los selectores 2 y 3 del BOT no aparecen
ni una vez en los 2893 objetos. Sin una sola observacion no hay forma de saber
su ancho ni su orden de bytes, y adivinarlos seria el peor modo de fallo
posible aqui: un tipo plausible y equivocado que ademas desalinea todo lo que
viene detras. `readBOT` falla cerrado ante ambos. Ampliar esto exige corpus
que los ejercite.

**Lo que este intake NO resuelve, y es la parte grande.** Decodificar el
ENCABEZADO no decodifica el CUERPO. Se probo lo obvio —reconstruir la forma
R2000 (`BS` tipo + `RL` bitsize + datos) y reusar los decodificadores
existentes por la misma via que el adaptador AC1018— barriendo TODOS los
valores posibles de `bitsize`: ninguno hace decodificar una LINE real. El
flujo de datos R2010+ manda las cadenas a un flujo propio y su cabecera comun
de entidad difiere aun de la R2000. Esa es la siguiente ola.

**Efecto en el producto**: ninguno observable. `readR2004Database` sigue
lanzando `DWG_VERSION_DECODER_UNSUPPORTED` para AC1024/AC1027/AC1032; lo que
cambia es su mensaje, que ahora nombra la frontera real (el cuerpo) en vez de
una ya superada (el tipo). `DWG_VERSION_REGISTRY` mantiene las tres versiones
en `decoderStatus: "unsupported"` y `CAPABILITIES.md` no promueve nada.

**Reproducible**: `node scripts/dwg/probe-r2010-object-header.mjs` con
`VALLE_DWG_CORPUS_MIRROR` apuntando al repo hermano; evidencia en
`docs/cad/evidence/dwg-r2010-object-header.json`.

## Intake 2026-08-31 (continuación) — CUERPO de objeto R2010+ resuelto para las cinco entidades sin cadenas (VALLE-CORPUS-R2010-OBJECT-BODY)

El intake anterior de esta misma fecha cerró nombrando la frontera que
quedaba: *"decodificar el ENCABEZADO no decodifica el CUERPO... el flujo de
datos R2010+ separa las cadenas a un flujo propio y su cabecera común de
entidad difiere aún de la R2000"*, y declaró explícitamente que reconstruir
la forma R2000 y reusar los decodificadores existentes NO funciona (ningún
`bitsize` hacía decodificar una LINE real). Este intake retoma justo ahí, sin
consultar fuente nueva, con el mismo corpus y el mismo método diferencial.

**Por qué el sondeo anterior no podía cerrar.** Buscaba reconstruir el
prólogo R2000 completo (BS tipo + RL bitsize) y comparar el resultado; el
verdadero problema era más simple de lo que parecía: la cabecera común de
entidad SÍ es la de R2000 sin cambio de anchura, pero antes de ella el
encabezado R2010+ (MS+UMC+BOT+H, ya resuelto) ocupa un número de bits
DISTINTO al que ocupaba el prólogo R2000 (BS+RL+H), así que cualquier
comparación que alineara ambos por su ancho de cabecera fallaba por una razón
ajena a la cabecera común en sí.

**El método que sí cerró: localizar sin hipótesis de forma.** En vez de
adivinar la disposición completa y comprobar si algo cuadraba, se buscó
directamente DÓNDE empieza el dato del tipo, por búsqueda bit a bit del
primer offset cuyos 8 bytes reproducen el double IEEE-754 EXACTO de un campo
geométrico conocido del gemelo AC1015 (la misma técnica, ya usada en el
intake 2026-08-23, que localizó independientemente la LINE real de
`02-una-linea.dwg`). Aplicada a los CUATRO tipos con campo inicial simple —
LINE, CIRCLE, ARC, POINT — el resultado fue el mismo para los cuatro dentro
de cada versión: el dato de tipo arranca 39 bits (AC1024) o 40 bits
(AC1027/AC1032) después del handle propio. Que la cifra coincida entre
CUATRO tipos que restan cantidades DISTINTAS de bits de su propio prefijo
(1 para el `zeroZ` de LINE, 2 para el flag BD del primer campo de
CIRCLE/ARC/POINT) es la falsación: un ancho equivocado en cualquier campo
previo los habría desalineado de forma distinta por tipo, no a la misma
cifra.

**Lo que hay en esos 39/40 bits.** Decodificado con el prólogo común R2000
SIN cambio de anchura (EED, gráfico, modo, reactores, sin-vínculos/xdic-
missing, color, escala de tipo de línea, banderas de tipo de línea y de
plotstyle — hechos ya registrados de ODA-ODS-DWG-5.4.1-PUBLIC), esos campos
decodifican valores sensatos (modo 2, color 256 ByLayer, escala 1.0, banderas
en 0) y consumen 16 de esos 39/40 bits en los 72 objetos medidos. El resto
(23 bits en AC1024, 24 en AC1027/AC1032) no tiene semántica identificada —
podría ser invisibilidad y lineweight reordenados, o un campo nuevo del
formato — y se declara CAPACIDAD AUSENTE: opaco, nunca interpretado con un
valor supuesto. El código de producción no separa estas dos partes: trata
los 39/40 bits completos como una anchura MEDIDA única, porque esa es
exactamente la afirmación que la búsqueda bit a bit falsó (no la
decomposición interna en dos tramos, que fue sólo el método de verificación).

**La geometría reutiliza, sin cambio, los decodificadores de tipo de R2000**
(`decodeLine`/`decodePoint`/`decodeCircle`/`decodeArc`/`decodeLwPolyline`,
ahora exportados desde `entities-core.ts` para esta reutilización) — cero
decodificadores gemelos, tal como exige el patrón ya sentado por el adaptador
AC1018→R2000.

**Hecho nuevo, no anticipado, sobre el encabezado YA resuelto**: `objectSize`
(el campo `MS`) mide bytes EXCLUYENDO sus propios bytes y los del campo `UMC`
que lo precede. El intake anterior no lo notó porque nunca leyó más allá del
handle propio; aquí, al necesitar saber dónde termina el cuerpo para
localizar el flujo de handles, `bodyBytes.length*8 - handleStreamBits` fue la
fórmula que efectivamente aterrizó, no `objectSize*8 - handleStreamBits`.
Confirmado: `bodyBytes.length` supera `objectSize` en exactamente el ancho en
bytes de MS más UMC en los 72 objetos medidos.

**El bit de presencia de cadenas.** El hecho ya registrado de
ODA-ODS-DWG-5.4.1-PUBLIC nombraba su EXISTENCIA ("AC1021+ introduce el flujo
de STRINGS separado al final del cuerpo... el bit de presencia del final del
dato") pero no su posición exacta. Este intake la midió: cae EXACTAMENTE un
bit antes del arranque del flujo de handles (ya conocido por MS/UMC), y vale
0 en las 72 observaciones — ninguna de las cinco entidades sin cadena lo
necesita. `readR2010EntityBody` lo lee y falla cerrado (`unsupported`, no
`corrupt`) si vale 1: el flujo de strings no se decodifica todavía.

**Falsación.** Geometría EXACTA (tolerancia 1e-6) contra el gemelo AC1015 en
**72/72** objetos (LINE, POINT, CIRCLE, ARC, LWPOLYLINE) de los 24 fixtures
AC1024/AC1027/AC1032, y aterrizaje EXACTO en el límite de handles (el
remanente tras la geometría debe ser exactamente 1 bit, el de presencia de
cadenas) en **72/72** — dos falsaciones independientes: una geométrica por
tipo, otra aritmética contra un límite conocido de antemano.

**Lo que este intake NO resuelve.** El flujo de handles (propietario, capa,
xdictionary) sigue sin decodificarse para R2010+, y con él, ninguna tabla de
símbolos (LAYER, BLOCK_RECORD…). Sin esas dos piezas no hay forma de
ensamblar una base neutral completa sin inventar una capa o una pertenencia
de bloque, así que `readR2004Database` sigue lanzando
`DWG_VERSION_DECODER_UNSUPPORTED` para AC1024/AC1027/AC1032 — su mensaje
ahora nombra esta frontera exacta en vez de la anterior, ya superada.
`readR2010EntityBody` (`reader/r2010-entity-body.ts`) vive como capacidad de
laboratorio independiente, sin conectar al lector de base de datos completo.
Tampoco se decodifica ninguna entidad CON cadena (TEXT, MTEXT, INSERT con
nombre de bloque…): el camino con el bit de presencia en 1 no tiene ni una
observación en este corpus.

**Riesgo residual declarado, sin suavizar.** La anchura fija de 39/40 bits
sólo está validada para el único caso que el corpus ejercita: EED ausente,
sin gráfico, 0 reactores, modo de entidad 2, banderas por defecto. El
chequeo de aterrizaje final (el remanente debe ser EXACTAMENTE 1 bit) detecta
la mayoría de los desalineamientos que un valor distinto de esos campos
produciría, pero no lo garantiza matemáticamente — el mismo tipo de riesgo
que ya acepta el adaptador R2004→R2000 de AC1018 para su propio corpus.
Ampliar la cobertura exige corpus que ejercite reactores, EED, gráfico o
modo de entidad distintos, no una suposición.

**Efecto en el producto**: ninguno observable. `readR2004Database` sigue
fallando cerrado para AC1024/AC1027/AC1032; `DWG_VERSION_REGISTRY` mantiene
las tres versiones en `decoderStatus: "unsupported"` y `CAPABILITIES.md`
declara la nueva capacidad como `experimental-lab`, acotada a las cinco
entidades sin cadenas y sin flujo de handles.

**Reproducible**: `node scripts/dwg/probe-r2010-object-body.mjs` con
`VALLE_DWG_CORPUS_MIRROR` apuntando al repo hermano; evidencia en
`docs/cad/evidence/dwg-r2010-object-body.json`.
