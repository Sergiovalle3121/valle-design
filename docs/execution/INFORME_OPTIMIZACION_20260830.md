# Informe de optimización — auditoría a profundidad y corrección

**30 de agosto de 2026** · rama `claude/valle-design-optimization-bkvqio` ·
base `main` @ `b6842a8` · repositorio compañero
`valle-design-dwg-conformance` @ `825bb2f` (misma rama designada)

Encargo del titular: analizar a profundidad los dos repositorios, encontrar
problemas reales, corregirlos y pulir. Decisiones de alcance del titular:
monolito por **extracción moderada y segura**; dependencias **solo por
seguridad**. Tres auditorías paralelas (apps / packages-crates-scripts /
CI-infra-docs-corpus) produjeron ~60 hallazgos verificados con archivo y
línea; este informe cuenta los corregidos, cómo se probaron y qué quedó
diferido a conciencia.

---

## 1 · Los bugs que valían la campaña

**Un DXF corrupto podía colgar la pestaña — y el gemelo Rust compartía el
defecto** (`7cf2710`, `df16639`). El patrón `while (sweep <= 0) sweep += 360`
vivía en siete sitios del lado TypeScript y en el crate wasm: con un barrido
de `-1e300` el bucle no termina jamás, y el gate de paridad no podía verlo
porque ambos gemelos coincidían en el error. Hoy la normalización es de forma
cerrada (`(sweep % 360) + 360`), rechaza no-finitos, corta en un techo de
1 000 000 grados, y vive en `arc-sweep.ts` + `normalized_sweep` de
`lib.rs` con specs hostiles (−1e300, ±Inf, NaN) que prueban la equivalencia
con el bucle histórico en el dominio donde éste terminaba. De paso el crate
estrenó `overflow-checks = true`, aritmética `checked_*` en los tamaños de
salida y su primer módulo `#[cfg(test)]`. El wasm se recompiló con su
generador oficial y la evidencia de paridad se regeneró en el mismo commit
(4 410 766 coordenadas comparadas; la ventaja ×3.1 se conserva).

**La forma DD `0b10` del códec DWG parcheaba los bytes en el orden
equivocado** (`927514c`). No se corrigió por fe en la especificación: un
censo sobre los 57 DWG del corpus localizó las dos únicas apariciones del
flag (en `19-dim-radial-diameter.dwg`) y la interpretación de la ODS §2.2
—2 bytes a las posiciones 4-5, 4 a 0-3— produce exactamente las líneas de
flecha de 3.0 que el oráculo DXF declara, donde la lectura secuencial
producía basura flotante. El hecho quedó registrado en el
`SOURCE_REGISTER.json` del repositorio de conformidad **antes** de tocar
`bitcodes.ts` (disciplina clean-room), y el test ahora usa los bytes reales
del corpus en vez de ser tautológico.

**El editor tenía atajos sobre estado muerto** (`eeeb17e`): el manejador de
teclado silenciaba `exhaustive-deps` y capturaba `[open, data]` obsoletos
(patrón latest-ref ahora), un `removeEventListener` quitaba un listener que
nunca se registró (arrow anónima vs nombre), y undo/redo/colaboración eran
tres copias de 45 líneas que ya divergían — hoy son una sola
`applyHistoryDocument`.

## 2 · Seguridad

- **Autorización por handler con gate propio** (`799a47b`): 27 de 103
  handlers HTTP no declaraban barrera. Ahora `check:authz` (nuevo en la
  cadena `check:cad`, con spec) exige que cada handler declare su decorador
  o figure en la lista de exenciones con la comprobación imperativa que el
  cuerpo realmente invoca; `permissions.guard.ts` responde 401 donde
  respondía 403.
- **Una sola comparación en tiempo constante** (`bedb65e`): seis copias de
  `constantTimeEqual`, dos con short-circuit por longitud, colapsan en la
  canónica de `common/security/` (hash-then-compare).
- **CORS sin eco del atacante** (`9d5f10b`): el rechazo pasa por
  `Logger('CORS')` con origen saneado (imprimibles, 200 chars) y el mensaje
  de error ya no repite el Origin recibido.
- **Infra** (`e7a252b`, `2cc92de`): compose publica solo en `127.0.0.1`,
  MinIO fijado por release, Dockerfiles con base `node@sha256:…` por digest
  (invariante nueva `base-digest` en `validate-dockerfiles`, 31 invariantes)
  y dependabot vigila también `github-actions` y `docker`.
- **Dependencias, solo seguridad** (`74b5ec7`): la única actualización es
  `@redocly/openapi-core` 1.34.19 para arrastrar `js-yaml` 4.3.1
  (CVE-2026-59870). Producción: 0 vulnerabilidades conocidas. El clúster
  restante de `npm audit` es `@lhci/cli` (dev, sin versión corregida
  publicada) — documentado como diferido.

## 3 · Una sola fuente de verdad (y una mentira materializada)

`CAD_DOCUMENT_LIMITS` es ahora LA fuente de los límites del documento
(`a13090e`); la API los deriva del contrato y el spec de compatibilidad
congela las 18 claves. La auditoría encontró deriva real: el contrato público
(OpenAPI + SDK) prometía `maxArchiveBytes` de 128 MiB mientras la API
aplicaba 32 MiB — la promesa pública era falsa. Se corrigió el contrato a los
32 MiB reales, se regeneró el SDK y `Tagged<TTag>` pasó a nominalidad real
(campo `__tag` requerido; 0 errores en el monorepo). `apps/api` y
`packages/contracts` corren con `strict: true`.

## 4 · El monolito, en la dosis acordada

`Layout3DEditor.tsx` bajó a 19 002 líneas (presupuesto actualizado con
`--update`; techo de `useState` intacto en 135). La pieza extraída es la que
más ramas de decisión concentraba: el intérprete de teclado, ahora
`editor-keyboard.ts` puro en dos fases (antes/después del motor) con unión
discriminada de acciones y spec rama a rama de 51 comprobaciones — la cascada
de Escape en su orden exacto, la precedencia de caminata, la tabla de solo
lectura (`70412f7`). Las 149 plantillas (4 982 líneas) salieron del chunk del
estudio a un `import()` dinámico del diálogo que las usa (`a1c97d0`).

## 5 · El CI de main estaba rojo — y era un hallazgo, no un estorbo

Cuatro corridas consecutivas fallidas en `main` (job E2E Firefox), desde
antes de la campaña. Dos causas reales (`8047c1a`):

- `movil.spec` pedía `isMobile` en Firefox, que Playwright no soporta. La
  suite se partió en emulación completa (Chromium/WebKit) y aproximación por
  viewport (Firefox), con el patrón idiomático de skip del repo.
- `cables-sueltos` pasaba en Chromium por ruido de canvas que enmascaraba la
  firma; el render determinista de Firefox destapó 6 controles sin efecto
  observable. El barrido ganó una sexta señal (diálogos), lee valores de
  input/textarea/select, y los controles legítimamente inertes quedaron
  clasificados con razón escrita (Select/Pan activos, Undo/Redo en historial
  vacío).

La validación final de este punto es el propio CI del PR (aquí no hay
Firefox instalable); es el único hallazgo cuya prueba viaja con el PR.

## 6 · Verificación que no muta y errores que explican

`npm run lint` raíz ya no reescribe `apps/api` (lint = check; `lint:fix`
explícito), `rubric.mjs --markdown --check` verifica sin escribir, turbo
declara `dist-cjs/**` (`d783d94`). Los scripts de gates dejaron de depender
del cwd y distinguen «corrupto» de «ausente» (`ea4b01e`). Los agregadores de
specs de `dwg-codec` se generan por `readdir` (imposible dejar un spec
muerto), y `readDwg` cumple su promesa de no lanzar errores crudos
(`ad31c32`). El presupuesto de lint bajó de 545 a 454 avisos medidos
(`82cea1e`). Documentación que mentía — el adaptador S3 «no conectado» que
existe completo, 48 variables fuera de `.env.example`, enlaces fantasma —
dice hoy la verdad (`a52f191`, `3cb7e08`, `4f976fa`).

## 7 · El repositorio de conformidad

Cinco commits en `valle-design-dwg-conformance` (`1a089f9` → `735ebc6`):

- El gate `check-corpus` — el único verificador desatendido, que decidía el
  merge con 0 tests — estrenó 11 pruebas que copian el repo real y lo mutan
  (hash roto, archivo colado, symlink, DWG fuera de bundle, campo inventado,
  `rights` ausente, validadores no independientes…), y valida hoy claves
  permitidas, derechos y el criterio real de validadores independientes.
- Los constructores dejaron de tragarse fallos: `exitCode` de conversión y
  round-trip comprobados, `result` **calculado** de la evidencia en vez de
  literal, contención de rutas con `inside()` en vez de `startsWith`.
- La ola 2 compone sobre los emisores de la ola 1 en vez de duplicarlos, con
  la inmutabilidad probada por `diff -r` byte a byte sobre los 25 DXF
  regenerados antes/después.
- README y AGENTS dicen la verdad (el repo es público-propietario, no
  «privado»; siete bundles, no «sin archivos DWG»; la regla de revisión
  remite a la enmienda §b vigente) y `npm test` (35 specs) corre por fin en
  su CI.

Los siete bundles admitidos permanecen intactos: ni un byte de fixture u
oráculo cambió en toda la campaña.

## 8 · Diferido a conciencia (va también en el PR)

Descomposición mayor del monolito (A1) · dashboard client-side (A18) · tests
de componentes — exigiría dependencia nueva (A19) · `noImplicitAny` global —
queda el trinquete (A5) · feedback tenant-scoped, decisión de producto (A11)
· dedup masiva de `scripts/` (B11) · techo 16 MiB y presupuesto por byte con
try/finally — evaluado, sin ganancia demostrada (B13) · gate spec↔SDK (B15)
· paralelizar `check:cad` (B16) · Caddyfile de staging (C12) · inputs finos
de turbo (C14) · clúster `@lhci/cli` sin fix publicado · dedup de
`runWave()` en el corpus — inverificable sin el conversor ODA en el entorno.

## 9 · Verificación de cierre

Sobre el árbol committeado, con
`VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance`: los seis
gates canónicos (`check:cad`, `check:dwg`, `typecheck`, `test`, `lint`,
`build`) en verde sobre el SHA candidato — la corrida final se asienta en el
PR. En el corpus: `npm test` 35/35 y `check-corpus`
`{"bundles":7,"status":"ok"}`. Las cifras de calidad viven donde siempre:
`rubric.mjs` computa, este informe no las duplica. Cada commit es temático y
reversible por sí solo; el mapa de rollback es el propio log de la rama.
