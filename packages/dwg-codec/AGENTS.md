# Reglas scoped del laboratorio DWG

Estas reglas se aplican a todo `packages/dwg-codec/` y complementan el
`AGENTS.md` raíz. Si difieren, aplica la regla más restrictiva.

## Estado y alcance

- Este directorio es investigación clean-room experimental, interna y no
  disponible en el producto.
- El package debe permanecer `private:true`, `UNLICENSED` y no publicable.
- No registrar provider, endpoint, upload, feature flag, UI, entitlement ni
  integración con `CadDocument` durante DWG-0.
- No depender de `apps/web`, React, NestJS, persistencia, red, filesystem
  implícito, telemetría o estado global.
- La frontera pública recibe `Uint8Array`. No conviertas bytes hostiles a
  `string` ni reutilices el contrato de interoperabilidad actual para fingir
  binarios.
- Rechaza vistas respaldadas por `SharedArrayBuffer`. Tras validar el límite de
  tamaño, copia una vez el `Uint8Array` ordinario a storage propio antes de
  detectar o parsear, para que el caller no pueda mutar la entrada a mitad del
  análisis.

## Clean-room obligatorio

Lee completamente `CLEAN_ROOM_POLICY.md`, `SOURCE_REGISTER.json`,
`THREAT_MODEL.md` y `CAPABILITIES.md` antes de editar código o fixtures.

- Registra una fuente antes de consultarla para derivar cualquier hecho,
  constante, algoritmo, test, comentario o fixture.
- Sólo `status: "allowed"` permite derivación. `quarantined` y `prohibited`
  bloquean la fuente y cualquier material basado en ella.
- No copies, traduzcas, portes ni adaptes código, headers, bindings, tablas,
  comentarios o tests de Autodesk, RealDWG, ODA, LibreDWG u otro codec.
- No uses filtraciones, descompilación, evasión de protecciones, SDKs sin
  autorización ni material con términos ambiguos.
- Están prohibidas GPL, AGPL, LGPL, MPL, SSPL, BUSL, source-available,
  y fuentes o codecs de terceros bajo licencias comerciales/restringidas,
  desconocidas o `NOASSERTION`. El material first-party de Valle conserva los
  términos propietarios del repositorio.
- Prefiere cero dependencias runtime. Una excepción exige justificación,
  versión fijada, lockfile, SBOM, notices y gate de licencia verde.
- No publiques planos de clientes, ejemplos instalados con software ajeno,
  archivos encontrados al azar, corpus privado, secretos ni datos personales.

## Fixtures y evidencia

- Sólo se admiten fixtures sintéticos de Valle, archivos de Sergio con permiso
  expreso de publicación o terceros con licencia explícita de uso y
  redistribución.
- Cada fixture debe cumplir `fixtures/manifest.schema.json` y registrar
  SHA-256, creador, fecha, origen, permiso/licencia, versión declarada, tamaño,
  propósito y expectativas.
- `sourceIds` debe resolver a entradas `allowed` de `SOURCE_REGISTER.json`.
  `check:fixtures` y `check:provenance` rechazan IDs, paths o hashes duplicados y
  cualquier path que, resuelto, salga de la raíz de fixtures o del repositorio;
  el schema por sí solo no expresa esas invariantes cruzadas.
- No ocultes binarios en base64, snapshots o strings largos.
- Un fixture creado por el mismo generador sólo prueba consistencia interna; no
  prueba compatibilidad con DWG real.
- Toda promoción de capacidad necesita evidencia independiente y reproducible.

## Seguridad del parser

- Trata cada byte como hostil y cada longitud como no confiable.
- Usa aritmética comprobada para offsets, sumas, multiplicaciones y
  conversiones.
- Toda lectura y reserva debe estar limitada por un budget inmutable.
- El budget incluye trabajo determinista y tiempo. Comprueba deadline y señal
  de cancelación a intervalos de trabajo acotados; devuelve un error tipado sin
  resultado parcial. El harness/worker debe terminar desde fuera una operación
  que no coopere dentro del límite de pared.
- Devuelve resultados discriminados y errores tipados con offset; ninguna
  entrada malformada puede escapar como `RangeError`, panic o excepción sin
  tipar en la frontera pública.
- Rechaza truncación, overflow/underflow, rangos fuera del archivo, secciones
  duplicadas o solapadas, ciclos, checksums inválidos cuando apliquen y trabajo
  excesivo.
- No recuperes silenciosamente una estructura desincronizada ni rellenes
  desconocidos con cero. Usa `unsupported`, diagnostics/loss manifest o falla
  cerrada.
- El mismo snapshot de entrada, límites y agenda de reloj/cancelación debe
  producir exactamente el mismo resultado o error. Las pruebas de deadline
  usan reloj inyectado, no sleeps.
- No ejecutes macros, scripts, OLE, URLs, rutas, comandos ni payloads
  embebidos.

## Arquitectura y lenguaje

- El codec produce una representación neutral, diagnostics y manifiesto de
  pérdidas. No crea otro documento canónico, historia, command bus o modelo de
  producto.
- TypeScript estricto, puro, acotado y sin dependencias runtime es el baseline,
  oráculo diferencial y fallback; no es código desechable.
- Rust sólo entra mediante un ADR posterior y focal, con perfil, mejora
  material, toolchain fijado, `forbid(unsafe_code)`, pruebas diferenciales,
  memoria acotada, benchmarks reproducibles, auditoría, licencias y SBOM Rust.
- No actives WASM ni lo conectes al producto por defecto en DWG-0.
- Ningún archivo TypeScript nuevo puede superar 800 líneas. Divide por
  responsabilidad, no por fragmentación artificial.

## Claims y revisión

- Actualiza `CAPABILITIES.md` con evidencia exacta; no promociones capacidades
  por código sin integración o fixtures autocreados.
- Reconocer `AC1015` no significa leer R2000. Leer un header no significa
  importar geometría. No hay writer en DWG-0.
- No uses “TrustedDWG”, sellos ajenos, afirmaciones de certificación Autodesk,
  paridad, 100% de compatibilidad ni propiedad sobre DWG.
- Cada PR declara fuentes consultadas, archivos derivados, fixtures,
  dependencias y que no se copió implementación externa.
- Antes de mergear ejecuta los gates reales, actualiza contra el `origin/main`
  más reciente y valida CI sobre el SHA exacto sin bypass.
