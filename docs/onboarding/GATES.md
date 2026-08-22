# Los gates: qué vigila cada uno y qué hacer cuando se pone rojo

Un gate rojo NUNCA se «pasa por esta vez». O se arregla lo que rompió, o se
cambia el gate por el procedimiento del final — con diff revisable y razón
escrita. Relajar un umbral para poner verde está prohibido por política de
campaña y por sentido común: un gate que cede deja de proteger.

## Los seis de antes de cada push

`check:cad && check:dwg && typecheck && test && lint && build` — sobre el SHA
exacto que se va a empujar. Los cuatro últimos son estándar; los dos primeros
son la batería propia del producto.

## La batería `check:cad`, pieza por pieza (en su orden)

| Gate | Qué verifica | Cuando está rojo |
| --- | --- | --- |
| `check:json-keys` | Manifiestos JSON sin claves duplicadas. | Hay una clave repetida: el último valor pisa al primero en silencio. Arregla el JSON. |
| `check:fonts` | El build no depende de Google: fuentes autohospedadas presentes y cero imports de `next/font/google`. | Alguien reintrodujo la descarga en build. Usa `next/font/local` con `src/fonts/`. |
| `check:cad-contract` | OpenAPI = SDK generado = router Nest (79 operaciones, byte a byte). | Cambiaste contrato sin regenerar (`npm run generate -w @valle/design-sdk`) o tocaste el SDK a mano (revierte). |
| `check:no-line-engineering` | Cero URLs del dominio heredado fuera del adaptador permitido. | Entró vocabulario/ruta del producto origen. Renombra al dominio CAD. |
| `check:no-industrial-domain` | El gate de identidad: 1500+ fuentes sin vocabulario industrial heredado. | Igual que arriba; la lista de residuos aceptados es explícita y sólo baja. |
| `check:monolith-budget` | `Layout3DEditor.tsx` no crece (líneas y `useState`): trinquete, sólo baja. | Metiste código nuevo en el monolito. Sácalo a `lib/` o a un componente; el presupuesto no se sube. |
| `check:wasm-kernel` | El kernel WASM committeado corresponde a su fuente (hash). | Regenera con el script del kernel; OJO en Windows: hashea en LF (ver memoria del repo). |
| `check:normas-mx` | La evidencia de normas de dibujo mexicanas está al día y cada convención cita fuente. | Corre sin `--check` para regenerar, o añade la fuente que falta. |
| `check:nl-cad` | Banco de calidad NL→CAD sobre umbrales (aciertos, rechazos tipados, cero fallos graves). | Tu cambio degradó el copiloto: mira qué casos caen antes de tocar umbrales (no se tocan). |
| `check:lint-budget` | Trinquete de AVISOS de lint por regla y workspace: subir falla. | Arregla los avisos nuevos; si de verdad bajaste el total de forma estable, `node scripts/check-lint-budget.mjs --update` y committea el techo nuevo. |
| `check:dwg-evidence` | La evidencia DWG committeada = lo que el árbol sostiene (capacidades promovidas, round-trips, bundles). Necesita `VALLE_DWG_CORPUS_MIRROR`. | Sin el espejo configurado es un falso rojo de entorno. Con espejo: la evidencia envejeció; regenera con `evidence:dwg` y revisa el diff con lupa. |
| `check:command-integrity` | Los ~192 comandos: ninguno responde éxito sin efecto verificable; exenciones declaradas y bidireccionales. | O tu comando nuevo termina en silencio/afirmando sin efecto (arréglalo: que haga o que diga que no puede), o la sonda no sabe conducirlo (decláralo en `command-integrity-exemptions.json` con razón). |
| `check:rubric:spec` + `check:rubric` | La rúbrica competitiva se computa desde evidencia y se imprime; nunca bloquea (una rúbrica que bloquea se infla). | Sólo falla su spec: el script mismo está roto. |

## `check:dwg`

Códec (`dwg-codec` con su propio check) + frontera de producto (el producto no
importa del laboratorio; sus specs de detección corren) + consumidor del
corpus (pin de commit y hash, falla cerrado). Rojo típico: rompiste la
frontera o el corpus no está donde `VALLE_DWG_CORPUS_MIRROR` apunta.

## Los transversales

- `check:governance` — invariantes de propiedad: manifiestos UNLICENSED,
  LICENSE/NOTICE/CONTRIBUTING con sus cláusulas, CODEOWNERS, registro de
  desarrollo asistido válido, baseline de protección fiel a lo observado,
  actions pineadas por SHA. Corre en CI.
- `check:licenses` — SBOM runtime sin licencias fuera de la allowlist
  (bloqueante en CI). `sbom:full` (runtime+dev) es evidencia adicional.
- `check:conventions` — dirección de dependencias: `lib/` no importa de
  `components/` ni de `app/` (ver CONVENCIONES.md).
- `check:deploy` — los Dockerfiles validan.

## El único procedimiento aceptable para cambiar un gate

1. El cambio va en su PROPIO commit, con el gate y su spec juntos.
2. El mensaje dice QUÉ se cambia y POR QUÉ la verdad de hoy es otra (no «para
   que pase»).
3. Los trinquetes (monolito, lint, identidad) sólo se mueven en la dirección
   declarada; un techo sube únicamente con decisión del titular escrita.
4. Si el gate compara contra un artefacto committeado (evidencia, SDK,
   goldens), se regenera con su script oficial y el diff se lee entero antes
   de committear. Un diff de evidencia que no entiendes es un rojo, no un
   «regenerado OK».
