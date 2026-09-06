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
