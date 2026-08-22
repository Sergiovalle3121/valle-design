# Convenciones del repositorio

Las verificables las verifica una máquina (se nombra el gate); las demás se
revisan en el PR. Ante conflicto entre esta página y un gate, manda el gate.

## Dónde va cada tipo de código

- **La lógica pura vive en `lib/`** (`apps/web/src/lib/cad/...`): geometría,
  documento, motor de comandos, render, interop. Se prueba en Node con un spec
  al lado (`cosa.ts` + `cosa.spec.ts`). Nada de React, THREE sólo en los
  módulos `-three` del render.
- **Los componentes viven en `components/`** y las rutas en `app/`. Un
  componente NO contiene lógica de dominio: la importa de `lib/`. La regla
  dura, verificada por `check:conventions`: **`lib/` jamás importa de
  `components/` ni de `app/`** — la dependencia apunta en una sola dirección.
- La API espeja el patrón: módulos Nest por dominio en `apps/api/src/modules`,
  adaptadores concretos bajo `adapters/`, puertos como tokens inyectables.
- El monolito (`Layout3DEditor.tsx`) NO es el patrón: es la deuda declarada
  (`docs/execution/DEUDA-MONOLITO.md`). Código nuevo no entra ahí; el
  presupuesto del monolito lo hace cumplir.

## Nombres de archivos

- `lib/`: kebab-case (`curve-edit.ts`, `native-selection-index.ts`); el spec
  se llama igual con `.spec.ts`.
- Componentes React: PascalCase (`CadCommandLineDock.tsx`).
- Scripts de gates: `scripts/**/check-*.mjs` con su `-spec.mjs` o `.spec.mjs`
  cuando el gate tiene lógica propia que probar.
- Sondas de evidencia: `apps/web/scripts/*-probe.mts` (tsx, importan de `src/`
  por ruta relativa) y su artefacto en `docs/cad/evidence/*.json`.

## Mensajes de commit

- En español, primera línea = QUÉ cambia para el producto, no qué archivos
  («TRIM señala lo que se va», no «cambios en curve-edit.ts»).
- El cuerpo explica el porqué y nombra los límites que quedan.
- Los commits de sesiones asistidas llevan el prefijo `@ ` y el trailer de
  atribución de herramienta; su marco legal está en
  `docs/governance/ASSISTED_DEVELOPMENT.md`.

## Comentarios

- Un comentario existe para decir lo que el código NO puede decir: la
  restricción, el porqué, el límite («LÍMITE, dicho en voz alta: …»). Nunca
  para narrar la línea siguiente.
- Los límites conocidos se declaran EN el código con su razón — el estilo de
  la casa es el comentario honesto largo, no el TODO mudo.
- Idioma: español para todo lo nuevo; el inglés heredado se traduce al tocar
  el archivo, no en barridos.

## Pruebas

- Cada módulo de `lib/` con lógica no trivial lleva spec en Node (autoejecutable
  vía tsx). Un recorrido de usuario nuevo lleva golden e2e.
- Una prueba afirma COMPORTAMIENTO («un rectángulo de área cero no se escribe,
  Y SE DICE»), no implementación.
- Prohibido debilitar una aserción para poner verde: si el contrato cambió, el
  spec se reescribe declarándolo en el commit.
