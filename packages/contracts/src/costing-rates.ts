/**
 * Tarifas de costeo por defecto — FUENTE ÚNICA de la plataforma.
 *
 * Antes cada motor traía las suyas y no coincidían: product-costing valuaba la
 * hora a $30 con 15% de overhead, mientras cost-intelligence la valuaba a $45
 * con 18%. La MISMA hora de piso costaba distinto según quién preguntara, y el
 * margen/COGS salía diferente por motor. Ahora los tres consumen estos
 * defaults, así que un cambio se hace en un solo lugar.
 *
 * Son DEFAULTS de plataforma, no tarifas finales: cada motor acepta override
 * por llamada, y la configuración por centro de costo/tenant es la capa
 * siguiente (persistir estos valores por `erp_cost_centers`/tenant). El valor
 * concreto (labor $/h, overhead) es una decisión de costeo del owner: se deja
 * aquí, explícito y en un solo sitio, para que ajustarlo sea trivial.
 */
export const DEFAULT_COSTING_RATES = {
  /** Tarifa de mano de obra por hora, en la moneda funcional del tenant. */
  laborRatePerHour: 45,
  /** Absorción de overhead como FRACCIÓN del costo directo (0.18 = 18%). */
  overheadRate: 0.18,
  /** Moneda por defecto cuando el contexto no aporta una funcional. */
  currency: 'USD',
} as const;

/** Overhead expresado como PORCENTAJE (para motores que trabajan en %). */
export const DEFAULT_OVERHEAD_PCT = DEFAULT_COSTING_RATES.overheadRate * 100;
