/**
 * ONBOARDING POR PRODUCTO — qué tiene que hacer ESTE cliente, no todos.
 *
 * El onboarding original era una lista fija de seis pasos con forma de
 * implantación de manufactura: perfil, equipo, entidad legal, datos maestros,
 * modo de datos y primer resultado. Esa lista era correcta para quien contrata
 * ERP y absurda para quien contrata sólo Documentos: a un despacho que compró
 * un editor de textos se le pedía dar de alta una entidad legal y cargar un
 * maestro de materiales.
 *
 * El daño no era estético. El progreso se calcula como completados/aplicables,
 * y los pasos inaplicables NUNCA se completan porque no existe el dato que los
 * derivaría. Un tenant de Documentos quedaba atascado en 33 % para siempre y
 * `ready` jamás se volvía verdadero. La lista fija no sólo pedía cosas de más:
 * hacía imposible terminar.
 *
 * Aquí cada paso DECLARA qué productos lo hacen aplicable. La lista efectiva es
 * la unión de los pasos de los productos que el tenant realmente tiene vigentes
 * — la misma fuente que decide el acceso, no una copia.
 *
 * ─── Qué NO vive aquí ────────────────────────────────────────────────────────
 * Las tablas que sirven de señal a un paso derivado. Un nombre de tabla es un
 * detalle del backend; si viviera en el contrato compartido, el navegador
 * cargaría el esquema de la base de datos para dibujar una lista de tareas.
 * El servidor mantiene ese mapa y publica únicamente el resultado.
 */

import { PRODUCT_CODES, type ProductCode } from "./product-catalog";

/* ────────────────────────────────── Pasos ─────────────────────────────────── */

/**
 * Claves estables de paso. Viajan a `tenant_onboarding_states.step_overrides`
 * y a la interfaz, así que son NEUTRALES de marca y no se renombran a la
 * ligera: renombrar una clave equivale a olvidar que el cliente ya la había
 * omitido.
 */
export const ONBOARDING_STEP_KEYS = [
  // platform-core — aplican siempre
  "company_profile",
  "team",
  // erp
  "legal_entity",
  "master_data",
  "erp_first_document",
  // mes
  "plant_site",
  "work_center",
  "mes_first_run",
  // design
  "design_first_drawing",
  // documents / spreadsheets / presentations
  "first_document",
  "first_spreadsheet",
  "first_presentation",
  // intelligence
  "intelligence_setup",
  // integrations
  "first_connector",
  // decisión humana, sólo con productos que cargan datos propios
  "data_mode",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export function isOnboardingStepKey(
  value: unknown,
): value is OnboardingStepKey {
  return (
    typeof value === "string" &&
    (ONBOARDING_STEP_KEYS as readonly string[]).includes(value)
  );
}

/**
 * `derived` se completa cuando existe el dato; `manual` requiere una decisión
 * humana que ningún dato puede inferir. La distinción importa porque un paso
 * derivado NO acepta que alguien lo marque como hecho: si se pudiera palomear,
 * el porcentaje mediría intención en lugar de estado.
 */
export type OnboardingStepKind = "derived" | "manual";

export interface OnboardingStepDefinition {
  readonly key: OnboardingStepKey;
  /**
   * Productos que hacen aplicable el paso. Basta tener UNO vigente. Varios
   * productos comparten paso cuando comparten el trabajo real: elegir entre
   * datos de ejemplo y datos propios sólo tiene sentido si contrataste algo
   * que carga datos, y entonces la pregunta es la misma para ERP y para MES.
   */
  readonly products: readonly ProductCode[];
  readonly kind: OnboardingStepKind;
  /** Dónde se resuelve el paso. */
  readonly href: string;
}

/**
 * Definición canónica. El ORDEN es el de la lista: primero lo que no depende
 * de ningún producto, después cada producto en el orden del catálogo.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    key: "company_profile",
    products: ["platform-core"],
    kind: "derived",
    href: "/dashboard/settings/organization",
  },
  {
    key: "team",
    products: ["platform-core"],
    kind: "derived",
    href: "/dashboard/settings/users",
  },
  {
    key: "data_mode",
    products: ["erp", "mes"],
    kind: "manual",
    href: "/dashboard/import",
  },
  {
    key: "legal_entity",
    products: ["erp"],
    kind: "derived",
    href: "/dashboard/erp/p2p",
  },
  {
    key: "master_data",
    products: ["erp", "mes"],
    kind: "derived",
    href: "/dashboard/import",
  },
  {
    key: "erp_first_document",
    products: ["erp"],
    kind: "derived",
    href: "/dashboard/erp/sd",
  },
  {
    key: "plant_site",
    products: ["mes"],
    kind: "derived",
    href: "/dashboard/settings/organization",
  },
  {
    key: "work_center",
    products: ["mes"],
    kind: "derived",
    href: "/dashboard/line-engineering",
  },
  {
    key: "mes_first_run",
    products: ["mes"],
    kind: "derived",
    href: "/dashboard/production",
  },
  {
    key: "design_first_drawing",
    products: ["design"],
    kind: "derived",
    href: "/dashboard/cad",
  },
  {
    key: "first_document",
    products: ["documents"],
    kind: "derived",
    href: "/dashboard/documents",
  },
  {
    key: "first_spreadsheet",
    products: ["spreadsheets"],
    kind: "derived",
    href: "/dashboard/sheets",
  },
  {
    key: "first_presentation",
    products: ["presentations"],
    kind: "derived",
    href: "/dashboard/presentations",
  },
  {
    key: "intelligence_setup",
    products: ["intelligence"],
    kind: "derived",
    href: "/dashboard/intelligence",
  },
  {
    key: "first_connector",
    products: ["integrations"],
    kind: "derived",
    href: "/dashboard/integration-outbox",
  },
];

const STEP_BY_KEY = new Map<OnboardingStepKey, OnboardingStepDefinition>(
  ONBOARDING_STEPS.map((step) => [step.key, step]),
);

export function findOnboardingStep(
  key: string,
): OnboardingStepDefinition | undefined {
  return isOnboardingStepKey(key) ? STEP_BY_KEY.get(key) : undefined;
}

/* ─────────────────────────── Lista efectiva del tenant ─────────────────────── */

/**
 * Pasos aplicables a un tenant, en el orden canónico.
 *
 * `platform-core` se añade siempre aunque no venga en la lista: es la base
 * incluida en cualquier contratación y sus dos pasos (perfil y equipo) aplican
 * incluso a un tenant cuyos productos están todos vencidos — sobre todo a ese,
 * porque es el que necesita poder seguir administrando su cuenta.
 */
export function onboardingStepsFor(
  products: readonly ProductCode[],
): OnboardingStepDefinition[] {
  const owned = new Set<ProductCode>([...products, "platform-core"]);
  return ONBOARDING_STEPS.filter((step) =>
    step.products.some((product) => owned.has(product)),
  );
}

/** Sólo las claves, para comparaciones y pruebas. */
export function onboardingStepKeysFor(
  products: readonly ProductCode[],
): OnboardingStepKey[] {
  return onboardingStepsFor(products).map((step) => step.key);
}

/* ──────────────────────────────── Validación ──────────────────────────────── */

/**
 * Invariantes que una definición mal editada rompería en silencio.
 *
 * La tercera es la que evita repetir el error que este archivo corrige: si un
 * producto contratable no aporta ningún paso, quien lo compre verá una lista
 * que ignora exactamente aquello por lo que pagó.
 */
export function validateOnboardingSteps(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const step of ONBOARDING_STEPS) {
    if (seen.has(step.key)) {
      problems.push(`Paso duplicado: ${step.key}.`);
    }
    seen.add(step.key);

    if (step.products.length === 0) {
      problems.push(
        `El paso ${step.key} no declara productos: nunca sería aplicable.`,
      );
    }
    for (const product of step.products) {
      if (!(PRODUCT_CODES as readonly string[]).includes(product)) {
        problems.push(
          `El paso ${step.key} referencia un producto inexistente: ${product}.`,
        );
      }
    }
    if (!step.href.startsWith("/")) {
      problems.push(`El paso ${step.key} necesita una ruta absoluta.`);
    }
  }

  for (const key of ONBOARDING_STEP_KEYS) {
    if (!seen.has(key)) {
      problems.push(`La clave ${key} está declarada pero no tiene definición.`);
    }
  }

  for (const product of PRODUCT_CODES) {
    const contributes = ONBOARDING_STEPS.some((step) =>
      step.products.includes(product),
    );
    if (!contributes) {
      problems.push(
        `El producto ${product} no aporta ningún paso de onboarding: quien lo contrate vería una lista que ignora lo que compró.`,
      );
    }
  }

  return problems;
}
