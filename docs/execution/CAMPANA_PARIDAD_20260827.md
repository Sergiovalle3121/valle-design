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
