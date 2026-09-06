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
