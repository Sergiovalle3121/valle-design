# Registro de decisiones — Campaña «El lunes de un arquitecto» (2026-09-06)

> Régimen de la sesión: horas sin detenerse y **sin preguntar**. Cada duda se
> resuelve con la opción más conservadora (§3.4.1 del prompt maestro) y se
> anota aquí **mientras se decide**, con el cuarto campo —qué haría falta para
> elegir lo otro— que convierte «no preguntar» en «preguntar en diferido».
>
> Prompt maestro: `docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`.
> Bitácora: `docs/execution/CAMPANA_LUNES_20260906.md`.

## D-01 · El techo del manifiesto de auditoría: 14, no 11
Qué se dudó ......  El prompt maestro ordena «bajar el techo de 28 a 11». El gate
                    (`check-auditoria-manifest.mjs`) exige que el techo sea
                    igual al número de ficheros en disco, y los tres `arnes`
                    (00-arranque, planta, precision) se quedan a propósito.
Qué se eligió ....  Techo 14 = 11 con defecto vivo + 3 arnes. La nota del
                    manifiesto lo explica.
Por qué es lo conservador ...  El gate tiene razón (regla 3 de la casa). 11
                    haría rojo el gate; cambiar el gate para excluir arneses
                    sería relajarlo.
Qué haría falta para elegir lo otro ...  Decidir que los arneses vivan en otra
                    carpeta (por ejemplo `e2e/arnes/`) con su propio gate.

## D-02 · Sesiones hermanas con Sonnet 5, por directiva del titular
Qué se dudó ......  El titular pidió a mitad de sesión abrir sesiones paralelas
                    con Sonnet 5 «para cosas que no necesiten Fable». Cuáles y
                    cómo integrar sin romper la regla del monolito ni el buzón.
Qué se eligió ....  Una sesión por frente con territorio exclusivo (§5.2), cada
                    una en su rama `claude/f<N>-…` y con PR borrador contra
                    `main`. Ninguna toca los ficheros de F0 (`rubric.json`,
                    `ESCALERA.md`, `BACKLOG.md`, `monolith-budget.json`,
                    `manifiesto.json`) ni `Layout3DEditor.tsx`: escriben
                    peticiones en `docs/execution/frentes/<frente>-peticiones.md`
                    y el coordinador las aplica y vuelve a medir (§3.3·2).
                    Integración frente por frente en esta rama, con suite
                    completa después de cada uno (§5.5).
Por qué es lo conservador ...  Reproduce el método que ya funcionó (49
                    peticiones, cero conflictos) y mantiene un solo escritor
                    por archivo caliente.
Qué haría falta para elegir lo otro ...  Permitir a los frentes editar
                    `rubric.json` directamente exigiría un merge de JSON a mano
                    en cada integración.

## D-03 · `FASE4_TESTIGO_AJENO_20260905.md` se queda en `docs/execution/`
Qué se dudó ......  Si archivarlo con las bitácoras (T-0D). No lleva prefijo
                    `INFORME_`, pero es el cierre medido de la fase 4 (#191).
Qué se eligió ....  Se queda: es evidencia medida, no un plan vencido, que es
                    el criterio de `AGENTS.md` para los `INFORME_*`.
Por qué es lo conservador ...  Mover un documento que otros enlazan rompe
                    enlaces; dejarlo no rompe nada.
Qué haría falta para elegir lo otro ...  Renombrarlo `INFORME_FASE4_…` y
                    corregir sus enlaces entrantes en el mismo commit.

## D-04 · Las cuarenta entradas «Frase» de Ctrl+K se OCULTAN, no se cablean
Qué se dudó ......  T-12·5 ofrece dos salidas honestas: retirar las cuarenta
                    entradas «Frase» (y sus tres cadenas del «copiloto») o
                    cerrar el circuito bajo un nombre que no mienta.
                    `no-ai-boundary.spec.ts` dice que el registro de frases
                    «sigue existiendo —y debe seguir—».
Qué se eligió ....  Retirar las entradas de la PALETA y las tres cadenas; el
                    parser (`commands/registry.ts`) se queda intacto, como
                    pide el guardián. `command-palette.spec.ts` defiende que
                    no vuelvan; golden 119 lo mira en el navegador.
Por qué es lo conservador ...  El preview terminaba en un estado que nadie
                    pinta (`commandPreview` sólo alimenta una ref) y el
                    «Aplicar» estaba muerto (`applyCommand`, retirado en el
                    paso 0 con prueba de eslint): cerrar el circuito es
                    construir una interfaz nueva; ocultar es un `git revert`.
Qué haría falta para elegir lo otro ...  Decidir que las frases se ejecuten
                    desde la línea de comandos (sin panel) y construir la
                    vista previa en `CadCommandLine`, con golden.

## D-05 · El frente F2 trabaja en un árbol de trabajo aparte con `node_modules` por hardlink
Qué se dudó ......  Editar ficheros fuera del monolito mientras el agente de
                    extracción edita el monolito en el árbol principal: un
                    typecheck a media edición daría rojos falsos a los dos.
Qué se eligió ....  `git worktree` en `/home/user/valle-design-f2` con
                    `node_modules` copiado por hardlink (`cp -al`); el enlace
                    simbólico no sirve: Turbopack rechaza un `node_modules`
                    que apunte fuera de la raíz del proyecto.
Por qué es lo conservador ...  Un escritor por árbol, como en la campaña
                    anterior (once árboles, 1,2 GB, cero conflictos).
Qué haría falta para elegir lo otro ...  Nada: es el método de la casa.

## D-07 · Los contenedores traen un `main` viejo: cada frente comprueba su base
Qué se dudó ......  Al integrar F4 apareció «no merge base»: su rama cuelga de
                    `1478471` (PR #121, de agosto). El clon de los contenedores
                    trae `main` en ese commit —el de esta sesión también—, y
                    una sesión que hace `checkout -b` desde ahí trabaja sobre
                    un árbol de hace un mes. F10 y F11 nacieron de `2fd2bfd`
                    (bien); F3, F5, F8 y F9 no habían empujado aún.
Qué se eligió ....  Aviso por rutina a los cinco frentes con la orden exacta:
                    `git fetch origin main && git merge-base HEAD origin/main`;
                    si la base es vieja, `git rebase origin/main` (rama
                    propia), gates otra vez sobre el árbol nuevo,
                    `push --force-with-lease` y nota en su bitácora. Mientras,
                    el coordinador no integra ninguna rama cuya base no sea
                    `2fd2bfd` o `4800017`.
Por qué es lo conservador ...  Integrar una rama nacida de agosto sería
                    aplicar diffs contra código que ya no existe; y `main`
                    usa squash, así que «se aplican diffs, no se fusionan
                    ramas antiguas» (§3.2).
Qué haría falta para elegir lo otro ...  Nada: es un defecto del entorno
                    (instantánea del clon) que conviene que el titular sepa,
                    porque volverá a pasar en cada sesión nueva.

## D-08 · Territorios concedidos a petición de los frentes (F8, F9)
Qué se dudó ......  F8 pidió el gate de términos y aviso al crear la cuenta
                    (T-63d) en `AuthPage.tsx` y `modules/identity`, que no
                    estaban en su lista; F9 pidió `viewport/render-pipeline-
                    host.ts` (territorio F7, sin sesión) para que el fondo real
                    del lienzo llegue a `defaultCadRenderStyle` (T-13).
Qué se eligió ....  Conceder ambos, acotados: F8 sólo `AuthPage.tsx`,
                    `app/register/**` y la parte 2 dentro de `identity`
                    (metadata del evento `identity.registered`, sin tocar
                    `modules/legal`); F9 sólo `setBackgroundColor` + `styleOf`
                    + su spec. Las líneas del monolito (mitad B de F9-P-01,
                    `nativeMassHosts` de F5-P-03, `onDrop` de F8-2) las tiende
                    el coordinador al integrar.
Por qué es lo conservador ...  Un solo escritor por archivo se mantiene;
                    ningún otro frente tenía esos archivos abiertos, y dejar
                    el hueco sin dueño era dejarlo sin arreglar.
Qué haría falta para elegir lo otro ...  Nada: la §5.2 del prompt maestro
                    permite al coordinador reasignar territorio.

## D-09 · `toolset-electrical.esquemas` se renombra a lo que verifica (F5-P-01, opción A)
Qué se dudó ......  El criterio cobra 2 pt por «símbolos normalizados,
                    numeración de conductores y etiquetado» y la evidencia
                    prueba las dos últimas mitades, no símbolos de esquema de
                    control (IEC 60617): `grep -rniE 'bobina|contactor|
                    relevador|guardamotor|seccionador|60617' apps packages`
                    sin aciertos de producto.
Qué se eligió ....  Opción A de la petición: el texto del criterio pasa a
                    «numeración de conductores y etiquetado de componentes»,
                    el `gap` declara los símbolos de esquema ausentes y
                    ESCALERA gana la fila en peldaño 0. Los 2 pt se mantienen
                    porque la evidencia sí prueba lo que el texto nuevo dice.
Por qué es lo conservador ...  Cambia una frase, no una cifra: la rúbrica
                    deja de prometer lo que no mide sin inventar un hueco
                    nuevo con puntos a mano.
Qué haría falta para elegir lo otro ...  Construir los símbolos IEC 60617
                    como bloques con atributos y su golden (ficha futura).

## D-10 · MinIO (AGPL) sólo por red como oráculo: pregunta del titular, no del coordinador (F10-P-08)
Qué se dudó ......  `CORPUS_POLICY.md` prohíbe AGPL «sin excepción»; la lista
                    describe bibliotecas enlazadas o redistribuidas. Un
                    servidor MinIO contactado sólo por red desde el cliente
                    S3 del producto no se enlaza ni se redistribuye.
Qué se eligió ....  No arrancar MinIO ni contar `object-storage.s3` con
                    evidencia independiente hasta que el titular lea la
                    política y decida. Queda en el informe de cierre.
Por qué es lo conservador ...  La política es del titular y la lectura
                    amplia («sólo lo enlazado») no está escrita.
Qué haría falta para elegir lo otro ...  Una línea del titular en
                    `CORPUS_POLICY.md` (o aquí) diciendo que el acceso por red
                    a un servidor AGPL no es material prohibido; entonces
                    F10 corre el adaptador S3 contra MinIO y congela el censo.

## D-11 · `hypothesis` (MPL-2.0) sale del prompt maestro como oráculo sugerido (F10-P-07)
Qué se dudó ......  La ficha T-03 sugería «radamsa, atheris o hypothesis»;
                    hypothesis es MPL-2.0 (PyPI, `license_expression`), que
                    `CORPUS_POLICY.md` prohíbe.
Qué se eligió ....  Corregir la ficha: `atheris` (Apache-2.0, rueda cp311) es
                    el fuzzer ajeno; hypothesis se nombra sólo como excluido.
                    En este entorno hypothesis se instaló al inicio de la
                    sesión (antes del aviso) y no entró en ningún artefacto
                    ni spec: se desinstala.
Por qué es lo conservador ...  Un dato de licencia equivocado en el prompt
                    maestro se hereda en cada sesión siguiente.
Qué haría falta para elegir lo otro ...  Nada.
