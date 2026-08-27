import { strict as assert } from "node:assert";
import {
  freeOfferHeadline,
  freePeriodLabel,
  checkoutIsVisible,
} from "@/config/launch";
import {
  accessEndsAt,
  daysUntil,
  trialNotice,
  trialStatus,
  type Subscription,
} from "./trial-phase";

/**
 * Las fronteras de una prueba de tres meses, probadas sin esperar tres meses.
 *
 * Lo que aquí se fija no es aritmética por gusto: cada caso corresponde a un
 * día concreto en la vida de alguien que se registró sin tarjeta y al que no
 * se le puede sorprender.
 */
let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const NOW = new Date("2026-08-27T12:00:00.000Z");
const inDays = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

function subscription(patch: Partial<Subscription>): Subscription {
  return {
    planCode: "standalone-trial",
    status: "trialing",
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    seats: 1,
    effective: true,
    ...patch,
  } as Subscription;
}

/* ── La etiqueta de la oferta sale del número, nunca al revés ─────────────── */

ok(freePeriodLabel(90) === "3 meses", "90 días son «3 meses» para una persona");
ok(freePeriodLabel(30) === "1 mes", "30 días son «1 mes», en singular");
ok(freePeriodLabel(14) === "14 días", "14 no es múltiplo de 30: se dice en días");
ok(
  freePeriodLabel(45) === "45 días",
  "45 días NO se redondea a «mes y medio»: el usuario comprueba días",
);
ok(freePeriodLabel(1) === "1 día", "el singular del día también");
ok(freePeriodLabel(0) === "", "cero días no es una oferta");
ok(freePeriodLabel(-5) === "", "una duración negativa no se anuncia");
ok(
  freeOfferHeadline(90) === "3 meses gratis",
  "el titular se construye con el número real del backend",
);
ok(
  freeOfferHeadline(0) === "",
  "sin duración válida no hay titular que enseñar",
);

/* ── El modo de lanzamiento por defecto es el gratuito ────────────────────── */

ok(
  checkoutIsVisible("commercial") && !checkoutIsVisible("free"),
  "el cobro sólo se enseña en modo comercial",
);

/* ── La fecha que manda ───────────────────────────────────────────────────── */

ok(
  accessEndsAt(subscription({ trialEndsAt: inDays(10) }))?.toISOString() ===
    inDays(10),
  "en prueba manda trialEndsAt",
);
ok(
  accessEndsAt(
    subscription({ trialEndsAt: inDays(-40), currentPeriodEnd: inDays(20) }),
  )?.toISOString() === inDays(20),
  "con prueba y periodo, manda la fecha MÁS TARDÍA: hasta cuándo puede trabajar",
);
ok(
  accessEndsAt(subscription({})) === null,
  "sin ninguna fecha registrada no se inventa una",
);
ok(
  accessEndsAt(subscription({ trialEndsAt: "no-es-una-fecha" })) === null,
  "una fecha ilegible se descarta en vez de propagar NaN a la pantalla",
);

/* ── Días completos, redondeando a favor del usuario ──────────────────────── */

ok(
  daysUntil(new Date(NOW.getTime() + 0.4 * 86_400_000), NOW) === 1,
  "con media tarde por delante quedan «1 día», no «0»",
);
ok(daysUntil(new Date(NOW.getTime() - 1000), NOW) === 0, "vencido hace un segundo: 0");
ok(
  daysUntil(new Date(NOW.getTime() - 2 * 86_400_000), NOW) === -2,
  "vencido hace dos días: negativo, y quien pinte decide",
);

/* ── Las cuatro situaciones ───────────────────────────────────────────────── */

ok(
  trialStatus(null, NOW).phase === "none",
  "sin suscripción no hay nada que anunciar",
);
ok(
  trialStatus(subscription({ trialEndsAt: inDays(60) }), NOW).phase === "active",
  "con 60 días por delante no se alarma a nadie",
);
ok(
  trialNotice(trialStatus(subscription({ trialEndsAt: inDays(60) }), NOW)) ===
    null,
  "y no se pinta banner",
);
ok(
  trialStatus(subscription({ trialEndsAt: inDays(14) }), NOW).phase ===
    "ending-soon",
  "a 14 días EXACTOS empieza el aviso (la frontera es inclusiva)",
);
ok(
  trialStatus(subscription({ trialEndsAt: inDays(15) }), NOW).phase === "active",
  "a 15 días todavía no",
);
ok(
  trialStatus(subscription({ trialEndsAt: inDays(3) }), NOW).canEdit,
  "durante el aviso se sigue editando: el banner informa, no bloquea",
);

const expirado = trialStatus(
  subscription({ trialEndsAt: inDays(-1), effective: false }),
  NOW,
);
ok(expirado.phase === "expired", "vencido cuando el servidor dice que no es efectivo");
ok(!expirado.canEdit, "vencido no edita");
ok(
  expirado.daysLeft !== null && expirado.daysLeft < 0,
  "y sabe cuánto hace que venció",
);

/* ── LA REGLA QUE NO SE PUEDE ROMPER ──────────────────────────────────────── */

const avisoVencido = trialNotice(expirado);
ok(avisoVencido !== null, "el vencimiento SIEMPRE se explica");
for (const palabra of ["abrirlos", "exportarlos", "DXF"]) {
  ok(
    avisoVencido!.includes(palabra),
    `el mensaje de vencimiento debe decir que «${palabra}» sigue funcionando: nada de pantallas muertas`,
  );
}
ok(
  !/perderás|se borrar|eliminad/iu.test(avisoVencido!),
  "y jamás amenazar con perder el trabajo, porque no se pierde",
);

const avisoPronto = trialNotice(
  trialStatus(subscription({ trialEndsAt: inDays(2) }), NOW),
);
ok(
  avisoPronto!.includes("en 2 días"),
  "el aviso cuenta los días que faltan de verdad",
);
ok(
  trialNotice(
    trialStatus(subscription({ trialEndsAt: inDays(1) }), NOW),
  )!.includes("mañana"),
  "a un día se dice «mañana», que es como habla una persona",
);
ok(
  trialNotice(
    trialStatus(subscription({ trialEndsAt: inDays(2) }), NOW),
  )!.includes("abrir y exportar"),
  "incluso antes de vencer se anuncia qué se conserva",
);

/* ── El servidor manda sobre el reloj del navegador ───────────────────────── */

ok(
  trialStatus(
    subscription({ trialEndsAt: inDays(30), effective: false }),
    NOW,
  ).phase === "expired",
  "si el servidor dice que no es efectivo, una fecha futura no lo desmiente",
);
ok(
  trialStatus(subscription({ trialEndsAt: inDays(-30), effective: true }), NOW)
    .canEdit,
  "y si el servidor dice que sí, un reloj adelantado no le quita el acceso",
);

console.log(`trial-phase: ${checks} comprobaciones de la oferta y sus fronteras`);
