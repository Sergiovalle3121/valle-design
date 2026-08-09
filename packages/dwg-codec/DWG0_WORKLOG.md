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
