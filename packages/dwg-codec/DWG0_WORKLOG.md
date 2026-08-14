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
