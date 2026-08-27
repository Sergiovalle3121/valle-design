# Informe — Campaña Paridad: la máquina de verdad

**Fecha:** 27 de agosto de 2026 · **Base de arranque:** `main` @ `51538db`
(CI #504 verde), sesión sobre `claude/valle-design-10-10-program-bmvvcf` tras
fusionar el PR #112 (`e6bc845`) · **Bitácora completa:**
[`CAMPANA_PARIDAD_20260827.md`](CAMPANA_PARIDAD_20260827.md)

Tesis de la campaña: la paridad no se construye agregando comandos, se
construye haciendo que cada capacidad sea digna de confianza y no vuelva a
romperse. Este informe dice qué se cerró, qué se investigó y se dejó
DECLARADO en vez de en silencio, y con qué números.

---

## 1. Lo que se cerró

### OLA 0 — el instrumento de verdad

- **0.6 (evidencia que no puede envejecer)**, la primera pieza cerrada:
  `check-command-integrity.mjs` sólo ESCRIBÍA su artefacto con `--write`,
  nunca lo comparaba en el paso normal — un desfase entre el artefacto
  comprometido y lo que el código realmente hace podía vivir para siempre
  sin que ningún gate lo notara. Ahora compara siempre, con `--write`
  reservado a la regeneración deliberada. La sonda de precisión de
  coordenadas grandes armaba su propio `Float32Array` a mano, sin pasar
  nunca por `tessellateCadEntity` — el teselador REAL del producto; ahora
  construye entidades `CadNativeEntity` reales y llama al teselador de
  verdad.
- **0.2 (verificador de la vista 3D)**: `Cad3DSolidDiagnostics.tsx`,
  evidencia real de malla —conteo de vértices y mallas leído directamente
  del grupo Three.js de la escena (`CadNativeMassHosts.getSnapshot()`)—,
  no la lista de botones recortada a 20 que hasta esta campaña era la
  única prueba de que el 3D "se construyó".
- **0.4 (invariante de capa en TODOS los hosts)**: `CadSolidShadeHost` y
  `CadSolidSnapHost` tenían CERO referencia a capa/visible/congelada —un
  sólido en capa apagada seguía renderizándose Y seguía imantando el
  cursor en 3D. Arreglados con el mismo `cad-layer-visibility.ts` que ya
  usaban los otros hosts; 15 comprobaciones nuevas en
  `layer-visibility-gate.spec.ts`, con un test de exhaustividad que
  compara contra CADA archivo `viewport/*-host.ts` para que un host nuevo
  sin su prueba de capa no se cuele en silencio.
- **0.3 (gate de "no mentir")**: confirmadas y cerradas las dos mentiras
  de truncamiento que dieron origen al criterio — ver 1.1 abajo. La
  prueba de que ya no mienten es un golden real, no un cálculo de Node:
  `e2e/golden/59-cad-selection-no-truncation.spec.ts`.
- **0.5 (paridad geométrica interna)**: `wall-takeoff-solid-parity.spec.ts`,
  gate de REGRESIÓN (techo 2%) sobre la brecha real medida entre el
  cuadro de cantidades y el sólido 3D — ver 1.3.
- **0.1 (oráculo geométrico de ida y vuelta)**: no se construyó el arnés
  unificado de los cuatro formatos — se investigó primero, se encontraron
  tres defectos REALES concretos con esa misma investigación, y esta
  campaña priorizó cerrarlos sobre construir el arnés que los habría
  encontrado. Backlogueado como P2-13 con el alcance exacto que falta.

### OLA 1 — los defectos de confianza

Tres arreglos reales, cada uno con su prueba negativa (revertir con
`git stash`, confirmar que el fallo nombra el número exacto del bug,
restaurar):

1. **DWG escribía ángulos en grados como si fueran radianes**
   (`dwg-native-writer.ts`) — el lado de LECTURA convertía, el de
   ESCRITURA no. Un arco de 180° salía escrito como 180 radianes crudos
   (≈10.313°, envuelto). `toCanonicalEntity()` explícito por tipo
   (`arc`, `insert`), nunca un mapeo genérico.
2. **DXF mezclaba espacio papel con espacio modelo** — el código de
   grupo 67 no se leía en ningún lado, ni al importar (archivo completo
   NI la orden `DXFIN`) ni al exportar. Cajetín, marco y hojas de layout
   entraban al mismo `modelSpace.entityIds` que el dibujo del
   arquitecto, indistinguibles — un recuento o un metrado sobre esa
   lista contaba de más sin que nada lo delatara. Cerrado en las dos
   direcciones con el patrón "excluir y declarar" que el escritor DWG ya
   usaba para su propia limitación de fase.
3. **El GLB no salía a escala 1:1** — `Layout3DEditor` exportaba la
   escena con su escala de AJUSTE DE CÁMARA (`s = 30/max(W,H)`, para
   encuadrar cualquier tamaño de predio), no en metros reales; glTF
   declara 1 unidad = 1 metro. Cada archivo salía a una escala arbitraria
   distinta según el tamaño de SU predio. `serializeCadGlbBlob` acepta
   ahora `exportScale`, aplicado sobre CLONES — nunca los objetos vivos
   de la escena.

Además: **1.5** (origen flotante en 3D + límites del dibujo excluyendo
espacio papel) se investigó y se confirmó YA RESUELTO por infraestructura
previa (`render-origin.ts`, `render-pipeline-host.ts`) — sin cambio de
código, sólo verificación. **1.6** (separación modelo/papel en TODOS los
hosts 3D) se investigó y se dejó backlogueada (P2-14): un hueco real pero
LATENTE — ningún camino de comando de hoy crea una entidad que viva sólo
en espacio papel, así que nada se manifiesta todavía, pero los cuatro
hosts de sólidos 3D no tienen el mismo invariante que 0.4 ya les dio para
capas. **1.7** (escritor DWG en fallo cerrado real) quedó cerrado
parcialmente por el arreglo de radianes; el resto —el fallo cerrado
contra el oráculo externo ODA— ya era correcto ANTES de esta campaña,
confirmado, no tocado.

### OLA 2 — la escalera de paridad

`docs/parity/ESCALERA.md`: siete peldaños de evidencia (no existe →
prototipo sin enchufar → enchufado sin prueba → probado con datos propios
→ verificado con oráculo independiente → gate de regresión activo →
legal y autorizado → producción medida en vivo), cada uno con qué se
puede prometer/no prometer y un ejemplo REAL del repositorio — los
ejemplos de los peldaños 4 y 5 son literalmente los gates que esta misma
campaña construyó. Generaliza el criterio de promoción que
`dwg-evidence.mjs` ya aplicaba sólo a DWG al resto del producto. Enlazada
desde `rubric.mjs --markdown`.

### OLA 3 — el volante

- **3.1**: `npm run doctor` (diagnóstico de sólo lectura: Node,
  workspaces, PostgreSQL/SQLite, puertos, corpus DWG, aviso de Windows) +
  `docs/onboarding/DESPLIEGUE-EN-UNA-TARDE.md` (camino condensado hacia
  la documentación técnica ya existente, no un duplicado de ella).
- **3.3**: `docs/guides/donar-corpus-dwg.md` — la política
  (`CORPUS_POLICY.md`) ya existía completa en el repositorio de
  conformidad; el hueco real era que nada en `valle-design` la resumía
  en pasos operativos ni señalaba dónde está.
- **3.4**: `sesion-con-arquitecto.md` revisada a fondo (enlaces y los
  cuatro ids de plantilla de otros oficios verificados contra el código,
  no sólo leídos) — precisa, sin cambios de fondo. Efecto lateral real:
  `PRIMER-DIA.md` decía puerto 3001 para la API en desarrollo; el real
  es 4000. Corregido.
- **3.2** (canal "algo salió mal" vía outbox): INVESTIGADO, NO
  IMPLEMENTADO por decisión explícita — toca dos aplicaciones, una
  migración posible y una decisión de privacidad real que merece la
  misma disciplina de prueba negativa que el resto de la campaña.
  Diseño completo con citas de archivo reales en BACKLOG P1-7.

---

## 2. Un hallazgo que no es de esta campaña, pero se topó con ella

`check:dwg-evidence` falla en el sandbox de esta sesión. Investigado a
fondo antes de tocarlo (nunca se relajó el gate): revertido TODO lo no
comprometido con `git stash`, sigue fallando igual — no es esta campaña.
Comparado el artefacto comprometido contra lo computado en vivo: el
ARCHIVO tiene MÁS evidencia (7 bundles admitidos, 2 capacidades
promovidas) que lo que este sandbox puede reproducir (0 bundles) sin
`VALLE_DWG_CORPUS_MIRROR`/`VALLE_DWG_CORPUS_TOKEN` — ninguno configurado
aquí. `.github/workflows/ci.yml:152-153` exporta el mirror antes de
correr esta cadena; CI reproduce el artefacto comprometido sin
diferencia. **Esto ya estaba documentado** — `INFORME_CAMPANA_PULIDO_20260822.md`,
punto 10 de sus siguientes pasos, lo señalaba el 22 de agosto y sigue sin
resolverse: configurar el mirror en el entorno de desarrollo/campaña
sigue pendiente. No se toca el artefacto: regenerarlo aquí SERÍA relajar
evidencia real (borraría 7 bundles/2 capacidades y los reemplazaría por
cero), exactamente lo que la regla 5 de esta campaña prohíbe, sólo que en
la dirección contraria a la intuición.

---

## 3. Cifras antes y después

| Métrica | Antes | Después |
| --- | --- | --- |
| Specs unitarios (web) | 416 | **417** (+1: `wall-takeoff-solid-parity.spec.ts`) |
| Rúbrica | 190/220 (86,4 %) | **190/220 (86,4 %)** — sin cambio: esta campaña arregla defectos y construye verificación, no capacidad nueva puntuable |
| Trinquete de lint | 547 (techo) | 547 (sin avisos nuevos) |
| `Layout3DEditor.tsx` | 20.244 líneas / 141 useState | **20.256** líneas / 141 useState (+12, capacidad nueva documentada: diagnóstico 3D) |
| `dxf-import.ts` | 1.044 líneas | **1.105** (+61, capacidad nueva documentada: detección de espacio papel) |
| Hosts 3D con invariante de capa | 2 de 4 (`wall-solid-host`, `room-solid-host`) | **4 de 4** |
| Goldens Playwright (`e2e/golden`) | sin barrer completo esta campaña hasta ahora | **VER SECCIÓN 4** |
| Commits de la campaña | — | 10 (`dc93d7b`…`d89d76d`), 4 push |
| Entradas de BACKLOG cerradas | — | 1 (P2-1, parcial — sólo la mitad que mentía) |
| Entradas de BACKLOG nuevas | — | 5 (P1-6, P1-7, P2-12, P2-13, P2-14) |

---

## 4. El barrido de goldens en árbol quieto (regla 4, obligatorio)

_(Completar tras la corrida — ver `apps/web/e2e/.report`.)_

---

## 5. Nota de método

Esta campaña sostuvo, de punta a punta, la disciplina de "implementar →
verificar verde → revertir con `git stash` → confirmar que el fallo
nombra el número/mecanismo EXACTO del bug → restaurar → verde otra vez →
gate suite completa → commit" para cada uno de los seis arreglos reales
(0.6a, 0.6b, 0.4+1.2, 0.3+1.1, 0.2, y los tres de 0.1/1.4/1.5-DXF) y para
los dos gates nuevos construidos desde cero (0.5/1.3, `doctor.mjs`). Un
gate que nunca se demuestra discriminando (que nunca se vio fallar por
la razón correcta) no es evidencia de que funcione — sólo de que no ha
fallado todavía.

La otra disciplina sostenida: cuando la investigación mostraba que un
ítem de la cola YA estaba resuelto (1.5) o que arreglarlo de fondo exigía
una decisión ajena a esta campaña —de negocio (1.3/P1-6) o de privacidad
(3.2/P1-7)—, se declaró así en vez de forzar un cierre cosmético. Un
ítem "cerrado" que en realidad se pospuso sin decirlo es la misma clase
de mentira que esta campaña entera existe para cazar en el producto.

---

## 6. Lo que sigue (backlog nuevo de esta campaña)

1. **P1-6** — el cuadro de cantidades sub-factura ~1,4% de fábrica en
   cada esquina de muro. Requiere que el titular decida el criterio de
   facturación de esquina; el gate de regresión ya existe.
2. **P1-7** — canal "algo salió mal" vía outbox. Diseño completo, sin
   implementar: dos aplicaciones, migración posible, decisión de
   privacidad real.
3. **P2-12** — espacio papel DXF: cubre 6 de 7 familias de entidad: falta
   el esquema 4 (POINT/XLINE/RAY/SOLID/WIPEOUT/IMAGE/ATTDEF).
4. **P2-13** — el oráculo geométrico unificado de los cuatro formatos que
   0.1 pedía originalmente. Ahora con tres bugs reales ya cerrados
   sirviendo de caso de prueba.
5. **P2-14** — los cuatro hosts de sólidos 3D no escopan por
   `modelSpace.entityIds` — hueco latente, con su criterio de aceptación
   exacto ya escrito.
6. **Configurar `VALLE_DWG_CORPUS_MIRROR`** en el entorno de desarrollo —
   sigue pendiente desde el 22 de agosto (informe anterior, punto 10);
   sin él, `check:dwg-evidence` seguirá rojo por entorno en cada campaña
   que lo corra fuera de CI.
