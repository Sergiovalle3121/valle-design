# INFORME — Campaña 3D-M1, 24 de agosto de 2026

Campaña en cascada sobre `valle-design`, desde `946c5db`, en la rama
`claude/valle-design-3d-campaign-t0zzad` (el entorno de esta sesión remota
exige rama dedicada + PR en vez de push directo a `main`; desviación del
prompt original documentada en `CAMPANA_3D_M1_20260824.md` §0). Encargo:
llevar el milestone 3D-M1 — una vista arquitectónica 3D paramétrica para un
edificio de un solo nivel — a un estado terminado y honesto: muros con
volumen real y vanos recortados, piso/cielorraso/cubierta derivados,
selección y edición en 3D con material y deshacer/rehacer, guardado y
recarga, y una fixture de aceptación verificada contra la API real y
PostgreSQL, no sólo contra fixtures herméticos.

## El hallazgo que manda sobre todo lo demás

**`CAD_DOCUMENT_MAX_SCHEMA` en la API estaba desactualizado en producción**:
el cliente ya escribía documentos en el esquema 10 (DIMVAR de cota) y la API
sólo aceptaba hasta el 9 — un documento nuevo, guardado por un usuario real,
podía ser rechazado por su propio backend. No es un bug introducido por esta
campaña: existía en `main` desde antes de que empezara (confirmado contra
`946c5db`). Se encontró y arregló de forma **independiente dos veces el
mismo día**: por esta campaña (commit `4477c1d`) y, en paralelo, por la
campaña DWG producto/main (PR #98) — las dos convergiendo en el mismo valor
(10), lo que produjo un conflicto de merge con cuerpos de test
CONTRADICTORIOS que git fusionó solo (línea por línea) sin darse cuenta de
que no tenían sentido juntos. Resuelto comparando ambos lados a mano
(`git show` de cada rama, no confiando en el auto-merge) en el commit
`7a104c4`. Registrado con la narrativa completa en el punto 7 y 10 de
"Commits de esta campaña" de la bitácora.

## Cifras antes → después

| Qué | Antes | Después |
| --- | --- | --- |
| Muros en 3D | Extrusión de perfil sin vanos reales; el volumen no distinguía hueco de macizo | Volumen B-rep real (kernel existente) con vanos recortados como agujero pasante; degenerados marcados `invalid`, no descartados en silencio |
| Piso/cielorraso/cubierta | No existían como volumen 3D | Extrusión B-rep sobre el contorno exterior real (`detectCadRooms`), apoyada en la altura de muro más baja (nunca atraviesa un muro corto) |
| Selección 3D | Sin verificar contra el sólido real | Pincha el sólido de `wall-solid-three.ts`, no una selección rápida por id — confirmado por golden en vivo |
| Material de muro | No existía | Campo aditivo y editable (sin bump de esquema), paleta cerrada de 5 valores, deshacer/rehacer gratis vía el comando genérico de propiedades, recolorea sin retesellar |
| Geometría 3D inválida | Un muro o masa que no construía su sólido desaparecía sin ningún aviso | Categoría `geometry` nueva en `CadValidationReport`: avisa en el panel "Release readiness", con el id o tipo exacto afectado |
| Vistas del visor 3D en vivo | 3 presets (iso/superior/frontal) | 6 presets (+ posterior/lateral izquierda/lateral derecha), extraídos a módulo propio para no crecer el monolito |
| Diff incremental | Sin medir | Recolorear por selección/material: 0,21-0,99 ms sin importar la escala (106×-302× más rápido que el build en frío según la escala), medido en 24/220/840 muros — `docs/cad/evidence/wall-mass-render-benchmark.json` |
| Cámara/autosave | Se reseteaba en cada autosave (efecto de montaje indexado por identidad de `data`) | Corregido en la causa raíz; continuidad de cámara con specs de umbral |
| Origen de escena | Fijo; peor error medido a 10⁷ era 0,375 unidades (37,5 cm en metros UTM) | Flotante; peor error a 10⁷ baja a 0,0000029 unidades — cierra P0-2 del backlog con golden UTM en vivo y evidencia en `docs/cad/evidence/large-coordinate-precision.json` |
| Vano vertical | Sin validar; un vano más alto que su muro se aceptaba | Rechazado en cliente Y servidor (`sill+height<=wall.height`) |
| Esquema máximo del documento (API) | 9 (desactualizado frente al cliente, ya en 10) | 10 — ver "El hallazgo que manda sobre todo lo demás" |
| Fixture de aceptación 3D-M1 | No existía contra la API real | `e2e/real/cad-3d-m1-real.spec.ts`: registro→organización→documento→muros/vano→selección 3D→material→CAS→sesión nueva→persistencia en PostgreSQL, 4 corridas consecutivas verdes |
| Specs unitarios de `apps/web` | 392 en `946c5db` (verificado con `git ls-tree`) | 405/405 verdes — 13 specs nuevos, ninguno perdido |
| Tests de `apps/api` | — | 688/688 en memoria + 166/166 contra PostgreSQL real (`test:pg`), ambos verificados en esta sesión |
| Presupuesto de monolito (`Layout3DEditor.tsx`) | 20245 líneas en `946c5db` (verificado; ya en su techo antes de empezar) | 20235/20245 — 10 líneas POR DEBAJO de donde empezó, pese a agregar funcionalidad real (material, geometría inválida, presets): una pieza (Corte F) hubiera excedido el techo y se resolvió con una extracción real (`camera-view-presets.ts`), no un recorte cosmético |
| Trinquete de lint (`apps/web`) | 547 | 547 — sin regresión en toda la campaña |

## Lo hecho, por corte (bitácora completa: `CAMPANA_3D_M1_20260824.md`)

- **Auditoría (Corte A)** — tres agentes de exploración read-only en paralelo
  sobre `946c5db`, antes de escribir una línea: qué de "vista 3D" ya existía
  de verdad (muy poco: extrusión de perfil plano, sin vanos, sin masas
  derivadas) contra lo que el estado del proyecto sugería.
- **Rescate crítico (Corte A cierre)** — causa raíz del reset de cámara en
  autosave; extracción de `rebuildCadAssetGroup` a un host reconciliable en
  `scene-objects.ts`; validación vertical de vano en cliente y servidor
  (verificado contra el PR #94 cerrado por fetch/diff/merge-tree de sólo
  lectura, sin copiar su código); origen flotante de escena, diseñado desde
  cero y no portado (cierra P0-2 del backlog).
- **Corte B** — volumen B-rep real de muro con vanos recortados como agujero
  pasante, sobre el kernel B-rep ya existente.
- **Corte C** — extensión de `detectCadRooms` (ya usado por el cuadro de
  áreas) para exponer el anillo de cada local y el contorno exterior de toda
  la planta; corrección de un bug propio encontrado en el camino (una planta
  abierta producía una cara degenerada de área cero que se confundía con el
  contorno exterior); extrusión de piso/cielorraso/cubierta sobre ese
  contorno vía el mismo kernel.
- **Corte D** — selección 3D sobre el sólido real (no quick-select),
  material nativo de muro aditivo y editable de punta a punta con
  deshacer/rehacer y guardar/recargar; hallazgo y arreglo independiente del
  bug de `CAD_DOCUMENT_MAX_SCHEMA`; CI roto por specs de esquema con el 10
  fijado a mano, arreglado con anclaje a la constante; merge con `main`
  (PR #98 fusionado en paralelo) resuelto comparando ambos lados a mano.
- **Corte E** — recolorear en vez de retesellar ante selección/material
  (mismo objeto de escena, sin reconstruir la malla); disposal endurecido en
  los tres anfitriones hermanos (muro/masa/sólido); primer benchmark del
  camino nativo (`npm run benchmark:cad:walls`); "instancing seguro"
  investigado y descartado por razones estructurales (geometría única por
  muro, sin nada repetible que instanciar en este camino — la oportunidad
  real, lotes de INSERT, queda anotada aparte, fuera de alcance).
- **Corte F** — geometría 3D inválida avisada en vez de desaparecer en
  silencio (categoría `geometry` nueva en `CadValidationReport`); tres
  presets de cámara nuevos, extraídos a módulo propio para no exceder el
  presupuesto del monolito; un tercer ítem recomendado por el agente de
  exploración (color fijo por tipo de masa) resultó ya existir desde el
  Corte C, documentado en vez de reconstruido.
- **Fixture de aceptación (Tarea #9)** — `e2e/real/cad-3d-m1-real.spec.ts`
  contra la API NestJS real y PostgreSQL 16 levantados en este mismo
  entorno: lo que ningún golden hermético puede probar (que muros/vano/
  material sobreviven un viaje real por el validador de la API y por
  PostgreSQL, y que una sesión completamente nueva recupera exactamente lo
  mismo). 4 corridas consecutivas, las 6 pruebas verdes en cada una.

## Verificación de esta sesión (Tarea #10)

Postgres 16 y la API NestJS real se levantaron en este mismo entorno (no
simulados): migraciones aplicadas, servidor de la API respondiendo en
`:4000`, servidor de Next en modo `dev` apuntando a esa API real.

- `npm run typecheck` limpio en `apps/web` y `apps/api`.
- `apps/web`: 405/405 specs unitarios; `check:monolith-budget` OK (20235
  líneas, 10 por debajo de su asignación de 20245); `check:lint-budget` OK
  (547/547, sin regresión).
- `apps/api`: `npm run lint:check` — 0 errores (345 avisos, sin gate propio
  de techo); `npm run test` — 688/688; `npm run test:pg` contra PostgreSQL
  real — 166/166.
- `npm run check:cad` (gate agregado desde la raíz): limpio en TODOS sus
  pasos salvo `check:dwg-evidence`, que compara la evidencia DWG comiteada
  contra lo que el árbol recalcula localmente — y ese recálculo depende del
  espejo privado del corpus de conformidad DWG
  (`Sergiovalle3121/valle-design-dwg-conformance`), que CI clona
  explícitamente antes de este paso (`.github/workflows/ci.yml`, con su
  propio comentario: *"Sin este paso, CI recalcula 'cero bundles' en frío y
  el deepStrictEqual contra la evidencia comiteada revienta — no es una
  regresión de código, es que CI nunca vio el corpus"*) y que esta sesión no
  tiene adjunto. No es un hallazgo de esta campaña ni algo que sus commits
  toquen (el archivo de evidencia en cuestión, `dwg-decoder-matrix.json`, lo
  tocó por última vez el commit `e0503e7` del PR #98, de la otra campaña).
  Los dos pasos siguientes del gate agregado (`check:command-integrity`,
  `rubric.spec.mjs`/`rubric.mjs`) se corrieron por separado, sin depender de
  ese corpus: 192 comandos · 0 éxitos falsos; rúbrica competitiva en
  189/220 (85,9 %) destino, sin cambio atribuible a esta campaña (no se
  agregaron filas nuevas a `docs/competitive/rubric.json` — esta campaña
  entrega un milestone, no una fila de la rúbrica competitiva, que es un
  artefacto de producto completo con su propio ritmo).
- `e2e/real/cad-3d-m1-real.spec.ts`: 4 corridas consecutivas, 6/6 pruebas
  verdes en cada una, contra la API y PostgreSQL reales de este entorno.
- Verificación manual en navegador real (no sólo specs) de los seis presets
  de cámara del Corte F: servidor de Next + Playwright desechable
  (creado, corrido, borrado), capturas de pantalla confirmando que la
  cámara se desplaza al eje correcto para cada preset.

## Lo que quedó abierto (no bloqueante; completo en `BACKLOG.md` y la bitácora de esta campaña)

- **P0-3 del backlog** (hallado cerrando el origen flotante, no por esta
  campaña específicamente): "Ajustar a la planta" y el encuadre inicial
  encuadran sobre el footprint DECLARADO, nunca sobre los límites reales de
  las entidades — un documento UTM con footprint pequeño sin extender a
  mano encuadra una cámara que no ve nada.
- Grip de GROSOR para el muro: la edición por eje ya funciona arrastrando en
  el visor; el grosor sólo se edita por el panel de propiedades.
- Plano de corte/cutaway real en el visor 3D en vivo: hoy los presets sólo
  reposicionan la cámara. SOLVIEW ya resuelve secciones arbitrarias para
  paper-space; llevar eso al visor 3D en vivo (clipping de Three.js + UI
  para colocarlo) es una pieza notablemente más grande, fuera de la
  recomendación original del agente de exploración para este corte.
- Instancing del sistema de lotes de INSERT (`buildCadInsertBatchObject`,
  `entity-three.ts`): se reconstruye entero en cada sincronización sin
  gatearse por si el cambio tocó algún INSERT — hallazgo aparte, no
  relacionado con muros/masas (que son estructuralmente no-instanciables),
  fuera del alcance de esta campaña.
- Kernel Rust/WASM sin enchufar (hallazgo de la rúbrica competitiva, no de
  esta campaña): `apps/web/src/lib/cad/wasm` no lo importa nadie fuera de
  sus propios specs.

## Próximos pasos, en orden

1. El titular revisa el PR de esta rama y los checks de esta sesión (todos
   citados arriba con su número exacto).
2. Decidir sobre P0-3 del backlog (encuadre por límites reales de entidad,
   no sólo footprint declarado) — ya tiene reproducción en un golden vivo.
3. Grip de grosor de muro arrastrable en el visor, si el flujo de edición
   por panel resulta insuficiente en uso real.
4. Evaluar si un plano de corte/cutaway real en el visor 3D en vivo entra en
   un milestone siguiente — es la pieza de mayor tamaño entre lo que quedó
   abierto.
5. Adjuntar el espejo del corpus DWG en cualquier sesión que necesite
   `check:dwg-evidence` en verde localmente (no bloquea CI, que ya lo
   provisiona).

## Registro de desarrollo asistido

Entrada `3D-M1-CAMPAIGN-2026-08-24` en
`docs/governance/assisted-development-log.json`, actualizada al cierre de
esta sesión con el alcance completo (todos los cortes, no sólo los
primeros), estado `proposed`: la adopción del titular se registra al
revisar este informe, el PR y los SHA empujados.
