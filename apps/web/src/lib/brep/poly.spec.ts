/**
 * Raíces de polinomios: los casos que hunden la fórmula de bachillerato.
 *
 * Lo interesante no es que `x² − 3x + 2` dé 1 y 2. Es que:
 *   · con `b² ≫ 4ac` la fórmula ingenua pierde la raíz pequeña por cancelación;
 *   · la cuártica bicuadrática (`q = 0`) hace singular la cúbica resolvente de
 *     Ferrari, y ése es exactamente el caso de una recta que corta un toro por
 *     su plano de simetría — el caso COMÚN;
 *   · una raíz doble sale desplazada si nadie la pule.
 *
 * Cada caso se comprueba además evaluando el polinomio en la raíz: una raíz que
 * no anula el polinomio no es una raíz, por muy bonita que sea.
 */
import { cubicRoots, polyEval, polyRealRoots, quadraticRoots, quarticRoots } from "./poly";
import { check, checkClose, makeRandom, randomIn, report } from "./spec-support";

function residual(coeffs: number[], roots: number[]): number {
  let worst = 0;
  for (const root of roots) worst = Math.max(worst, Math.abs(polyEval(coeffs, root)));
  return worst;
}

// --- Cuadrática ---
{
  const roots = quadraticRoots(1, -3, 2);
  check("x²−3x+2 tiene dos raíces", roots.length === 2);
  checkClose("raíz menor = 1", roots[0], 1);
  checkClose("raíz mayor = 2", roots[1], 2);
}
check("x²+1 no tiene raíces reales", quadraticRoots(1, 0, 1).length === 0);
{
  const roots = quadraticRoots(1, -2, 1);
  check("x²−2x+1 colapsa a una raíz doble", roots.length === 1);
  checkClose("la raíz doble es 1", roots[0], 1);
}
{
  // El caso de cancelación: raíces 1e-8 y 1e8. La forma ingenua pierde la pequeña.
  const coeffs = [1, -(1e8 + 1e-8), 1];
  const roots = quadraticRoots(coeffs[0], coeffs[1], coeffs[2]);
  check("cancelación catastrófica: siguen saliendo dos raíces", roots.length === 2);
  checkClose("la raíz PEQUEÑA conserva sus dígitos", roots[0], 1e-8, 1e-20);
  checkClose("la raíz grande también", roots[1], 1e8, 1e-6);
}

// --- Cúbica ---
{
  const roots = cubicRoots(1, -6, 11, -6);
  check("x³−6x²+11x−6 tiene tres raíces", roots.length === 3);
  checkClose("raíz 1", roots[0], 1, 1e-10);
  checkClose("raíz 2", roots[1], 2, 1e-10);
  checkClose("raíz 3", roots[2], 3, 1e-10);
}
{
  const roots = cubicRoots(1, 0, 0, -8);
  check("x³−8 tiene una sola raíz real", roots.length === 1);
  checkClose("y vale 2", roots[0], 2, 1e-12);
}
{
  const roots = cubicRoots(2, 0, -1, 0);
  check("2x³−x = 0 tiene tres raíces", roots.length === 3);
  checkClose("raíz central en 0", roots[1], 0, 1e-12);
  checkClose("raíces simétricas ±1/√2", roots[2], Math.SQRT1_2, 1e-12);
}

// --- Cuártica ---
{
  // (x−1)(x−2)(x−3)(x−4) = x⁴ −10x³ +35x² −50x +24
  const coeffs = [1, -10, 35, -50, 24];
  const roots = quarticRoots(1, -10, 35, -50, 24);
  check("cuártica con cuatro raíces distintas", roots.length === 4, `obtenidas ${roots.length}: ${roots}`);
  checkClose("raíz 1", roots[0], 1, 1e-9);
  checkClose("raíz 2", roots[1], 2, 1e-9);
  checkClose("raíz 3", roots[2], 3, 1e-9);
  checkClose("raíz 4", roots[3], 4, 1e-9);
  check("todas anulan el polinomio", residual(coeffs, roots) < 1e-8, `residuo ${residual(coeffs, roots)}`);
}
{
  // Bicuadrática pura: x⁴ − 5x² + 4 → ±1, ±2. Aquí Ferrari se vuelve singular.
  const roots = quarticRoots(1, 0, -5, 0, 4);
  check("bicuadrática: cuatro raíces", roots.length === 4, `obtenidas ${roots.length}: ${roots}`);
  checkClose("−2", roots[0], -2, 1e-12);
  checkClose("−1", roots[1], -1, 1e-12);
  checkClose("+1", roots[2], 1, 1e-12);
  checkClose("+2", roots[3], 2, 1e-12);
}
{
  // Cuártica sin raíces reales: x⁴ + 1.
  check("x⁴+1 no tiene raíces reales", quarticRoots(1, 0, 0, 0, 1).length === 0);
}
{
  // Doble par: (x−1)²(x+2)² → raíces 1 y −2, cada una doble.
  const roots = quarticRoots(1, 2, -3, -4, 4);
  check("raíces dobles se colapsan a dos valores", roots.length === 2, `obtenidas ${roots.length}: ${roots}`);
  checkClose("raíz doble −2", roots[0], -2, 1e-6);
  checkClose("raíz doble +1", roots[1], 1, 1e-6);
}

// --- Deflación de grado ---
{
  const roots = polyRealRoots([0, 0, 1, -3, 2]);
  check("un polinomio con ceros iniciales baja de grado", roots.length === 2);
  checkClose("y da 1", roots[0], 1);
  checkClose("y da 2", roots[1], 2);
}

// --- Corpus aleatorio reproducible: toda raíz devuelta ANULA el polinomio ---
{
  const random = makeRandom(0x0f11_2233);
  let worst = 0;
  let totalRoots = 0;
  for (let i = 0; i < 500; i += 1) {
    const coeffs = [
      randomIn(random, -3, 3) || 1,
      randomIn(random, -5, 5),
      randomIn(random, -5, 5),
      randomIn(random, -5, 5),
      randomIn(random, -5, 5),
    ];
    const roots = polyRealRoots(coeffs);
    totalRoots += roots.length;
    // Se normaliza el residuo por la derivada para que una raíz de un polinomio
    // muy inclinado no parezca mala sólo por la escala.
    for (const root of roots) {
      const scale = Math.max(1, Math.abs(4 * coeffs[0] * root ** 3 + 3 * coeffs[1] * root ** 2));
      worst = Math.max(worst, Math.abs(polyEval(coeffs, root)) / scale);
    }
  }
  check("500 cuárticas aleatorias devuelven raíces reales", totalRoots > 500, `${totalRoots} raíces`);
  check("y todas anulan su polinomio", worst < 1e-7, `peor residuo normalizado ${worst.toExponential(3)}`);
}

report("brep/poly", 35);
