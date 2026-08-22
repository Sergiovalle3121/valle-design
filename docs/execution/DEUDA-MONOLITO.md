# La deuda del monolito, con número y método

`apps/web/src/components/cad/editor/Layout3DEditor.tsx` — hoy (2026-08-22):
**20,248 líneas y 141 `useState`**, medidos por `check:monolith-budget`, que
es trinquete: el número sólo puede bajar.

## Por qué es LA deuda y no una molestia

Cada función de los próximos años —objetos de arquitectura, colaboración en
vivo, la primera vertical— pasa por este archivo y cuesta más que la
anterior. Es el impuesto compuesto del producto: no pagarlo hoy es pagarlo
triplicado mañana, y llega el día en que ninguna sesión (humana o asistida)
puede razonar sobre el archivo completo.

## La meta, publicada como compromiso y no como aspiración

- **Objetivo: menos de 8,000 líneas.**
- **Ritmo mínimo: el trinquete baja AL MENOS un escalón declarado por
  campaña.** Una campaña que toca el editor y deja el presupuesto igual debe
  decir por qué en su informe.
- Fecha de esta declaración: 2026-08-22 (campaña de cimientos, por directiva
  del anexo de crecimiento). Registro del avance: la tabla de abajo, una fila
  por campaña.

## El método: costuras reales, no bloques arbitrarios

Extraer por lo que YA no depende del estado del editor, en este orden de
menor a mayor riesgo:

1. **Lo que ya es puro y está atrapado**: funciones de cálculo definidas
   dentro del componente que no leen refs ni estado → a `lib/`.
2. **Los anfitriones ya modelados**: el patrón existe y funciona
   (CadCommandEngineHost, CadNavigationHost, CadPlotHost viven FUERA con
   `useSyncExternalStore`): cada subsistema del monolito que hable con el
   motor sale como anfitrión propio (selección, capas, xrefs, colaboración).
3. **Los paneles con frontera de props limpia**: JSX de paneles que sólo
   reciben datos y callbacks → componentes propios (el dock de librería y la
   paleta de bloques ya muestran el patrón).
4. **Al final, el efecto de escena**: el cableado THREE/cámara, que es lo que
   más refs cruza, se va cuando los anfitriones de arriba le hayan quitado
   todo lo demás.

Reglas del método: cada extracción con spec en Node (si es lógica) o golden
(si es visible); el presupuesto se baja con `--update` EN el mismo commit; los
163 avisos `react-hooks/refs` del archivo bajan con cada pieza que sale (el
trinquete de lint lo registra).

## Registro

| Fecha | Campaña | Líneas | useState | Qué salió |
| --- | --- | --- | --- | --- |
| 2026-08-22 | cimientos (declaración) | 20,248 | 141 | — (esta declaración; la campaña paralela de pulido retira imports muertos hoy mismo) |
