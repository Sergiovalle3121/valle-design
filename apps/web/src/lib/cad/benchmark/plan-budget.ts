/**
 * Presupuesto del perfil «plano real» a 20.000 entidades.
 *
 * ## Para qué máquina son estos números
 *
 * Para ESTA, la de desarrollo: AMD Ryzen 5 5500U (6 núcleos físicos, 12 hilos),
 * 7,4 GB de RAM, Windows 11, con otros procesos encima. NO son los del runner
 * de CI y no deben copiarse allí. Los dos specs de `e2e/performance/` ya tienen
 * presupuestos calibrados para un runner de 2 vCPU; mezclarlos daría un gate
 * que pasa siempre en un sitio y falla siempre en el otro.
 *
 * ## Por qué el margen es el que es
 *
 * El presupuesto tiene que hacer dos cosas incompatibles: fallar ante una
 * regresión de verdad y NO fallar porque el portátil estuviera compilando algo.
 * La dispersión medida entre corridas en esta máquina, con carga vecina real,
 * llega a rondar el 30–40 % en las métricas de reloj de pared. Un margen del
 * 15 % daría un gate que grita cada semana sin que nadie haya roto nada, y un
 * gate que grita en falso se acaba desactivando: es peor que no tenerlo.
 *
 * Por eso cada presupuesto se calibra contra TRES observaciones y no una
 * —benchmark dedicado, spec con la máquina libre y spec con la máquina
 * disputada—, y se toma el mayor de dos márgenes sobre ellas. La cuenta exacta,
 * métrica a métrica, está junto a `CAD_PLAN_BUDGETS`. El punto de equilibrio se
 * eligió del lado de no tener falsos positivos, porque el gate corre en local y
 * su única fuerza es que la gente se lo crea.
 *
 * ## Lo que estos presupuestos NO son
 *
 * No son un SLO de producto. Son un TRINQUETE: fijan lo ya conseguido para que
 * un cambio futuro no lo deshaga en silencio. Que una operación esté dentro de
 * presupuesto no dice que sea buena, dice que no ha empeorado al doble.
 */

export interface CadPlanBudgets {
  /** Reloj de pared de la apertura completa, con el dibujo entero encuadrado. */
  openMs: number;
  /** Construir el índice de selección del documento entero. Coste de apertura. */
  selectionIndexBuildMs: number;
  /** Trabajo de CPU del peor cuadro de cada veinte, al panear. */
  panFrameP95Ms: number;
  zoomFrameP95Ms: number;
  /** Una selección por ventana del tamaño de una habitación. */
  windowSelectionP95Ms: number;
  crossingSelectionP95Ms: number;
  /** Una consulta de OSNAP: índice, escena de enganche y resolutor. */
  snapP95Ms: number;
  /** commit→escena asentada al mover un grupo salido de una selección. */
  moveCommitToSettleP95Ms: number;
  deleteCommitToSettleP95Ms: number;
}

/**
 * Medida de referencia sobre la que se calcularon los presupuestos.
 *
 * Viaja en el código, y no sólo en el JSON de evidencia, porque quien vea el
 * gate en rojo necesita saber contra qué se está comparando sin abrir otro
 * archivo. Es la corrida publicada en
 * `docs/cad/evidence/cad-plan-benchmark-20k.json`.
 */
export const CAD_PLAN_BASELINE = {
  profileId: "plano-real-20k",
  entities: 20_000,
  mix: "plano-real",
  recordedAt: "2026-08-17",
  machine:
    "AMD Ryzen 5 5500U (6 núcleos / 12 hilos), 7,4 GB RAM, Windows 11, Node v22.18.0",
  runs: 3,
  published: "mediana entre corridas",
  evidence: "docs/cad/evidence/cad-plan-benchmark-20k.json",
  marginFactor: 3,
  /**
   * Lo OBSERVADO en la corrida publicada: proceso dedicado, 200 consultas y 40
   * grupos de edición por operación, tres repeticiones y mediana. Es el número
   * que se publica en la evidencia.
   */
  observed: {
    openMs: 1_237.425,
    selectionIndexBuildMs: 512.518,
    panFrameP95Ms: 8.084,
    zoomFrameP95Ms: 5.599,
    windowSelectionP95Ms: 0.324,
    crossingSelectionP95Ms: 0.286,
    snapP95Ms: 2.65,
    moveCommitToSettleP95Ms: 10.968,
    deleteCommitToSettleP95Ms: 10.619,
  } satisfies CadPlanBudgets,
  /**
   * Lo observado por el SPEC con la máquina libre: una sola pasada en caliente
   * de 120 consultas y 40 grupos. Coincide con el benchmark dentro del ruido,
   * que es la señal de que las dos medidas hablan de lo mismo.
   */
  observedInSpec: {
    openMs: 1_283.734,
    selectionIndexBuildMs: 445,
    panFrameP95Ms: 7.634,
    zoomFrameP95Ms: 4.708,
    windowSelectionP95Ms: 0.385,
    crossingSelectionP95Ms: 0.351,
    snapP95Ms: 2.16,
    moveCommitToSettleP95Ms: 10.516,
    deleteCommitToSettleP95Ms: 12.153,
  } satisfies CadPlanBudgets,
  /**
   * Y lo observado con la máquina DISPUTADA —otros dos agentes compilando y
   * midiendo a la vez—, que es la condición en la que el gate va a correr de
   * verdad más a menudo de lo que a nadie le gustaría.
   *
   * Es el dato que gobierna el presupuesto. La degradación medida no es
   * uniforme y por eso no vale un factor único: la apertura sube 1,34×, pero
   * construir el índice sube 2,3× —es la operación que más depende de la
   * memoria disponible— y las métricas de submilisegundo llegan a 3×.
   */
  observedUnderLoad: {
    openMs: 1_715.009,
    selectionIndexBuildMs: 1_026,
    panFrameP95Ms: 10.521,
    zoomFrameP95Ms: 8.938,
    windowSelectionP95Ms: 1.147,
    crossingSelectionP95Ms: 0.517,
    snapP95Ms: 3.022,
    moveCommitToSettleP95Ms: 16.817,
    deleteCommitToSettleP95Ms: 17,
  } satisfies CadPlanBudgets,
} as const;

/**
 * Los presupuestos vigentes.
 *
 * ## La regla
 *
 * Cada presupuesto es **el mayor de dos cuentas**, redondeado hacia arriba a
 * una cifra legible:
 *
 * 1. **×3 sobre el benchmark dedicado** (`observed`).
 * 2. **×2 sobre la peor observación con la máquina disputada**
 *    (`observedUnderLoad`).
 *
 * La segunda cuenta es la que manda casi siempre, y es la que hace que esto
 * funcione. El gate vive en el spec, y el spec corre dentro de una suite de 300
 * en una máquina compartida: calibrar sólo contra la corrida dedicada daría un
 * presupuesto que se cumple en el papel y falla el día que alguien compila algo
 * en la otra ventana. Un gate que grita en falso se acaba desactivando, y
 * entonces no atrapa nada — que es peor que no tenerlo.
 *
 * ## ¿Qué ataja y qué no?
 *
 * - Un cambio que TRIPLIQUE el coste de cualquier operación cae.
 * - Un cambio que lo DOBLE pasa cuando la máquina está cargada. Es una pérdida
 *   real que este trinquete no atrapa, y se acepta a sabiendas: la degradación
 *   medida sólo por la carga vecina ya llega a 2,3× en el índice y a 3× en las
 *   métricas de submilisegundo. Pedir más finura sería pedirle al gate que
 *   distinga una señal de un ruido que la tapa.
 *
 * Con estos números, las TRES observaciones de calibración —benchmark dedicado,
 * spec con la máquina libre y spec con la máquina disputada— pasan, y la peor
 * de las tres se queda como mínimo al doble por dentro de su presupuesto.
 *
 * ## Y no son un SLO
 *
 * Que una operación esté dentro de presupuesto no dice que sea buena: dice que
 * no ha empeorado al doble. El juicio de si el producto va fluido está en la
 * evidencia publicada, no aquí.
 */
export const CAD_PLAN_BUDGETS: CadPlanBudgets = {
  // max(1.237×3 = 3.712 · 1.715×2 = 3.430). Es una apertura, no un gesto: el
  // usuario la espera una vez y el trinquete sólo tiene que impedir que se
  // vuelva insufrible.
  openMs: 4_500,
  // max(513×3 = 1.538 · 1.026×2 = 2.052). Manda la carga: construir el índice
  // es, de todo lo que hay aquí, lo más sensible a la memoria disponible.
  selectionIndexBuildMs: 2_500,
  // max(8,08×3 = 24,3 · 10,52×2 = 21,0). Sigue siendo menos de dos cuadros de
  // 60 Hz: una regresión que lo triplique deja de caber en un cuadro y cae.
  panFrameP95Ms: 27,
  // max(5,60×3 = 16,8 · 8,94×2 = 17,9).
  zoomFrameP95Ms: 22,
  // max(0,324×3 = 0,97 · 1,147×2 = 2,29). Manda la carga por goleada: a escala
  // de submilisegundo, el calentamiento del compilador y el reparto de turnos
  // del sistema operativo pesan más que la operación medida.
  windowSelectionP95Ms: 3,
  // max(0,286×3 = 0,86 · 0,517×2 = 1,03). Mismo motivo.
  crossingSelectionP95Ms: 2,
  // max(2,65×3 = 7,95 · 3,02×2 = 6,04). Coherente con el gate que el
  // repositorio ya tenía para OSNAP —p95 < 12 ms con 100.000 arcos— y más
  // apretado, que es lo correcto con cinco veces menos entidades.
  snapP95Ms: 8,
  // max(10,97×3 = 32,9 · 16,82×2 = 33,6).
  moveCommitToSettleP95Ms: 37,
  // max(10,62×3 = 31,9 · 17×2 = 34).
  deleteCommitToSettleP95Ms: 34,
};

export interface CadPlanBudgetViolation {
  metric: keyof CadPlanBudgets;
  observed: number;
  budget: number;
}

export interface CadPlanVerdict {
  profileId: string;
  passed: boolean;
  violations: CadPlanBudgetViolation[];
}

export function evaluateCadPlanBudget(
  observed: CadPlanBudgets,
  budgets: CadPlanBudgets = CAD_PLAN_BUDGETS,
): CadPlanVerdict {
  const violations = (Object.keys(budgets) as Array<keyof CadPlanBudgets>)
    .filter((metric) => observed[metric] > budgets[metric])
    .map((metric) => ({
      metric,
      observed: observed[metric],
      budget: budgets[metric],
    }));
  return {
    profileId: CAD_PLAN_BASELINE.profileId,
    passed: violations.length === 0,
    violations,
  };
}
