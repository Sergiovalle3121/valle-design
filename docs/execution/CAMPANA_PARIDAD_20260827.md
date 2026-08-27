# Campaña Paridad — la máquina de verdad (27 de agosto de 2026)

Referencia de arranque: `main` @ `51538db` (CI #504 verde). Sesión real
de arranque: rama `claude/valle-design-10-10-program-bmvvcf`, tras
fusionar el PR #112 (`e6bc845`) que ya adelantó dos cierres de backlog
verificados esta misma mañana (ver `CAMPANA_10X_20260827.md`).

Tesis: la paridad no se construye agregando comandos, se construye
haciendo que cada capacidad sea digna de confianza y no vuelva a
romperse. Esta campaña arregla la MÁQUINA QUE CONSTRUYE — los
verificadores — antes que cualquier función nueva.

## Reglas de no-detención (vigentes toda la campaña)

1. Nunca preguntar. Decidir lo más conservador, escribirlo aquí y seguir.
2. Ítem bloqueado más de 25 minutos → bitácora + backlog + siguiente ítem.
3. Este archivo se actualiza al cerrar CADA ítem. Si el contexto se
   compacta, el primer acto es releerlo.
4. Después de CADA ola: `npm run check:cad && npm run check:dwg &&
   npm run typecheck && npm test && npm run lint && npm run build`, más
   el barrido de goldens con el árbol quieto. Push al cerrar cada ola.
5. Prohibido relajar un gate, un umbral o un golden para poner verde.
   Prohibido tocar identificadores persistidos (lista congelada en
   `IDENTITY.md` y ADR-0010). Prohibido renombrar un `data-testid`.
6. Prohibido agregar funciones nuevas en esta campaña. Lo que no está en
   esta cola va al backlog. No agregar es la mitad del valor.

## Nota de arranque — qué se pausó para dar paso a esta campaña

La sesión traía en curso una generación de evidencia de estrés denso a
100k (`modify.dense-stress`, 1 pt) corriendo en segundo plano. No está en
esta cola y la regla 6 es explícita: se mató el proceso (`pkill
playwright`/`headless_shell`) y se borró el artefacto parcial sin
publicar nada. Detalle de por qué se había empezado y sus números
parciales (útiles si se retoma) quedan en `CAMPANA_10X_20260827.md`, sin
tocar de nuevo hasta que esta campaña cierre. Tampoco se toca
`blocks.bedit` (investigado read-only esta mañana, ver el mismo archivo)
— no está en esta cola.

## Cola (transcrita del prompt maestro, sin editar)

### OLA 0 — el instrumento de verdad (~3 h)
- 0.1 Oráculo geométrico de ida y vuelta (DXF/DWG/PDF/GLB, números no botones)
- 0.2 Verificador de píxeles/raycast para 3D, no lista de botones recortada
- 0.3 Gate de "no mentir" — toda cifra informada al usuario viene del resultado real
- 0.4 Invariante de visibilidad de capa aplicado a TODOS los hosts
- 0.5 Gate de paridad geométrica interna (cantidades vs. 3D)
- 0.6 Evidencia que no puede envejecer (matriz de comandos, sonda de precisión real, oráculo ODA)

### OLA 1 — los defectos de confianza (~3 h)
- 1.1 Los topes que mienten (slice(0,300)/slice(0,200) con aviso falso)
- 1.2 El imán a lo invisible (hosts de sólidos sin filtro de capa)
- 1.3 El cuadro de cantidades contra el modelo real
- 1.4 GLB en 1:1, sin normalización a 30 unidades
- 1.5 Origen flotante en 3D + límites del dibujo excluyendo espacio papel
- 1.6 Espacio modelo/papel separados de verdad en todos los hosts 3D
- 1.7 Escritor DWG en fallo cerrado real (sigue apagado; se arregla debajo)

### OLA 2 — la escalera de paridad (~2 h)
- Escribir `docs/parity/ESCALERA.md`, 7 peldaños con criterio + evidencia
  independiente + qué se puede prometer/no prometer; enlazar desde la rúbrica.

### OLA 3 — el volante (~1.5 h)
- 3.1 `docs/onboarding/DESPLIEGUE-EN-UNA-TARDE.md` + `npm run doctor`
- 3.2 Canal de reporte "algo salió mal" dentro del producto, vía outbox
- 3.3 Procedimiento de corpus donado con procedencia
- 3.4 Revisar/actualizar `docs/guides/sesion-con-arquitecto.md`

### OLA FINAL — la verdad medida (~30 min, obligatoria)
- F.1 Suite completa + goldens en árbol quieto + push
- F.2 Rúbrica con lectura de la escalera
- F.3 Backlog actualizado (cerrado borrado con su commit, nuevo agregado)
- F.4 `docs/execution/INFORME_CAMPANA_PARIDAD_20260827.md`

### Cola de reserva (sólo si sobra tiempo)
- R.1 Aislar/medir el índice de selección puro (motor vs. interfaz)
- R.2 Meter rendimiento/memoria en CI aunque sea semanal
- R.3 Rediseñar la prueba de memoria: desmontar sin navegar
- R.4 TypeScript estricto en API y contratos

## Bitácora

### 2026-08-27T07:11Z — arranque
Campaña creada. Empezando por 0.1 (oráculo geométrico de ida y vuelta) —
es el ítem que, de haber existido, habría cazado por sí solo tres de los
cinco defectos citados en la tesis (grados-como-radianes, fuga de espacio
papel, GLB con escala arbitraria). Antes de escribir código: barrido
read-only para localizar qué arneses de round-trip YA existen por formato
(DXF/DWG/PDF/GLB) y qué comparan hoy, para extender en vez de duplicar.

### 2026-08-27T07:33Z — barrido read-only completo de los 6 ítems de OLA 0

Seis investigaciones read-only en paralelo (una por 0.1-0.6), cada una
citando código real (`file:line`), no prosa. Resultado — TODOS los
defectos que la tesis nombra están confirmados y localizados con
precisión quirúrgica:

- **0.1** — DWG: `packages/dwg-codec/src/api/canonical.ts:356-357,674-675`
  pasa ángulos sin convertir grados↔radianes (bug real, confirmado
  asimétrico: la importación SÍ convierte, la exportación no).
  DXF: cero conciencia de espacio papel en
  `dxf-cad-document.ts`/`dxf-document-export.ts`/`document-import.ts:316,398`
  — exportar "Todo" mezcla espacio papel sin marcarlo, reimportar
  reclasifica todo a espacio modelo. GLB:
  `Layout3DEditor.tsx:6029-6031` (`s = 30/Math.max(W,H)`) hornea una
  escala dependiente del footprint del documento en el archivo
  exportado — sin contrato de "1 unidad GLB = X unidades reales".
- **0.2** — el check de botones es real y exactamente como se describe
  (`Layout3DEditor.tsx:17527-17558`, `.slice(0,20)`, sin relación con
  si se construyó una sola malla). `CadNativeMassHosts` no publica
  ningún diagnóstico al DOM.
- **0.3** — DOS mentiras confirmadas: Bug A, QSELECT/FILTER
  (`select-query.ts` + `Layout3DEditor.tsx:3159-3180` `selectNative`,
  tope 300) reporta el conteo ANTES del truncamiento. Bug B,
  selección por capa (`Layout3DEditor.tsx:12342-12368`, tope 200) igual,
  y peor: el truncamiento es explícito y el toast lo ignora en la línea
  de al lado. El mismo bug YA se diagnosticó y arregló para
  ventana/cruce/lazo (`Layout3DEditor.tsx:7357-7382`, comentario propio:
  "SIN tope, como el lazo: el tope de 300 truncaba en silencio") —
  QSELECT y selección-por-capa quedaron fuera de ese arreglo.
- **0.4** — la hipótesis original (muros/masas) era incorrecta: esos
  DOS hosts SÍ filtran por capa y están probados. Los dos hosts reales
  sin filtro son `CadSolidShadeHost` (`solid-shade-host.ts:307-330`) y
  `CadSolidSnapHost` (`solid-snap-host.ts:97-140`) — CERO referencia a
  capa/visible/congelada en ningún sitio del archivo; un sólido en capa
  apagada o congelada se sigue renderizando Y sigue imantando el
  cursor en 3D — la violación literal de la doctrina propia del
  código. Efecto río abajo: `glb-export.ts` incluye el grupo de
  `CadSolidShadeHost` sin filtro propio, así que el GLB también fuga.
- **0.5** — confirmado y CUANTIFICADO con código real (no estimado): en
  un cuarto de 5,0×4,0 m con muros de 250 mm, `buildCadBimSchedule()` da
  10,65 m³ y el sólido 3D real (`wallSolidBodyLocal` + `bodyMassProperties`,
  integración independiente por teselado) da 10,80 m³ — **1,39% de
  brecha total, exactamente igual a la suma de los descuentos de
  solape** que `cadWallJunctionOverlaps` resta. Causa raíz: el inglete
  EXTIENDE la cara exterior de un muro en la esquina y RECORTA la
  interior en la misma medida — conserva el área propia de cada muro —
  pero el camino de cantidades sólo resta el solape interior medido y
  nunca agrega de vuelta la extensión exterior equivalente. La cifra
  literal "0,90% por esquina" del prompt no aparece en el repo (grep
  vacío) pero el mecanismo real confirmado es del mismo orden de
  magnitud.
- **0.6** — los 3 artefactos confirmados sin regenerar-y-comparar:
  `check-command-integrity.mjs` sólo escribe con `--write`, nunca
  compara en el paso normal. La sonda de precisión
  (`large-coordinate-precision-probe.mts:65-87`) arma su propio Float32Array
  restando el origen a mano — nunca llama a `tessellateCadEntity`
  (`tessellation-cache.ts:123-151`), el teselador real. El oráculo ODA
  (`scripts/dwg/oda-roundtrip.mjs`) no está enchufado a ningún script
  npm y además requiere un binario Windows que no existe en este
  contenedor — su `--check` sólo podrá ser parcial (declarar cuándo se
  saltea, nunca pasar en silencio).

Informes completos con cita exacta línea por línea, riesgos y plan
recomendado por ítem: ver el resultado del workflow
`wf_e7ad1e39-db4` (journal en el directorio de transcripciones de la
sesión) — no se copian aquí completos por tamaño; cada commit de
implementación cita las líneas relevantes de nuevo al tocarlas.

**Orden de ejecución elegido** (más aislado/barato primero, según mi
propio juicio — regla 1, nunca preguntar): 0.6a (check de
comando-integridad, ~1h, cero riesgo) → 0.6b (sonda de precisión) →
0.4+1.2 (hosts de sólidos, arreglo acotado y ya tiene el patrón
correcto en wall-solid-host.ts para copiar) → 0.3+1.1 (mentira de
truncamiento, empezar por el Bug A que no toca el monolito) → 0.2
(diagnóstico 3D, aditivo) → 0.5+1.3 (gate de paridad; el ARREGLO de
`bim-schedule.ts` cambia qué se factura por muro — decisión de
negocio, no técnica; se documenta la brecha, NO se cambia la
facturación sin autorización explícita) → 0.1 (el oráculo completo,
el más grande y el que más monolito/DWG/DXF toca).

### 2026-08-27T07:45Z — cierra 0.6a: gate de comando-integridad ya compara

`scripts/cad/check-command-integrity.mjs` construye el payload SIEMPRE
(antes sólo bajo `--write`) y, sin el flag, lo compara contra
`docs/cad/evidence/command-integrity.json` — falla con el campo exacto
que difiere (`total`, cada `verdicts.*`, exenciones agregadas/retiradas)
si no coincide. Verificado con prueba negativa real: corrompí `total` a
999 y `verdicts.muta` a 1 en el artefacto committeado, corrí el gate —
falló con exit 1 y el mensaje exacto `total: 999 → 192` /
`verdicts.muta: 1 → 63`; restauré el artefacto original, corrió verde de
nuevo. `npm run check:command-integrity` verde sobre el árbol real.
Cierra BACKLOG P2-10.

### 2026-08-27T08:05Z — cierra 0.6b: la sonda de precisión ya ejercita el teselador real

`apps/web/scripts/large-coordinate-precision-probe.mts` construía su
propio `Float32Array` restando el origen a mano
(`x1 - origin.x, …`) — probaba su propia aritmética, nunca
`tessellateCadEntity` (`render/tessellation-cache.ts:123-151`), el
teselador que realmente corre en producción. Reescrita para construir
entidades `CadNativeEntity` de tipo `line` reales y llamar a
`tessellateCadEntity` por cada una (`renderer.paths()` del registro de
adaptadores produce los puntos, la resta de origen ocurre dentro de esa
función, no en la sonda). Resultado, corrido contra el árbol real:
**bit a bit idéntico** al artefacto previamente committeado (incluida la
cifra atípica de "nave grande 10⁴", 0,000325 unidades — confirma que no
era un error de mi reescritura sino un rasgo real del sistema). Prueba
de que el teselador real ya se comporta como la sonda fabricada
asumía — ahora demostrado, no supuesto.

Agregado modo `--check` (recomputa y compara contra
`docs/cad/evidence/large-coordinate-precision.json`, mismo patrón
`stable()`/`checkArtifact()` de `dwg-evidence.mjs`), envoltorio
`scripts/cad/check-precision-evidence.mjs`, y dos scripts npm nuevos:
`evidence:precision` (escribe) y `check:precision-evidence` (compara,
encadenado en `check:cad` junto a `check:dwg-evidence`). Verificado con
prueba negativa real: corrompí el número committeado, el gate falló con
exit 1 y el mensaje correcto; restauré, volvió a verde.
`npm run check:cad` completo, verde de punta a punta con el gate nuevo
adentro.
