import assert from "node:assert/strict";
import { describeCadSaveFailure } from "./save-failure";

/**
 * Las frases que un despacho va a leer en su peor momento.
 *
 * La prueba no comprueba redacción: comprueba las TRES cosas que un aviso de
 * guardado tiene que tener siempre —qué pasó, qué pasa con su trabajo y qué
 * puede hacer— y que ninguna de ellas llega en inglés ni con jerga.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** Lo que nunca puede aparecer, venga de donde venga. */
const JERGA = [
  /Failed to fetch/iu,
  /\bTypeError\b/u,
  /Design API respondió/iu,
  /\[object Object\]/u,
  /\bundefined\b/u,
  /\bHTTP\s*\d{3}\b/u,
  /Internal Server Error|Unauthorized|Forbidden|Payload Too Large|Too Many Requests/iu,
];

const casos = [
  {
    nombre: "red caída (TypeError del navegador)",
    error: new TypeError("Failed to fetch"),
    online: true,
    kind: "offline",
  },
  {
    nombre: "navegador que se sabe desconectado",
    error: new Error("cualquier cosa"),
    online: false,
    kind: "offline",
  },
  {
    nombre: "sesión caducada",
    error: Object.assign(new Error("Design API respondió 401"), { status: 401 }),
    online: true,
    kind: "session",
  },
  {
    nombre: "prueba terminada: sólo lectura",
    error: Object.assign(new Error("Design API respondió 403"), {
      status: 403,
      code: "entitlement_required",
      body: { details: { reason: "read_only_after_lapse" } },
    }),
    online: true,
    kind: "read-only",
  },
  {
    nombre: "sin permiso de edición",
    error: Object.assign(new Error("Design API respondió 403"), { status: 403 }),
    online: true,
    kind: "permission",
  },
  {
    nombre: "documento demasiado grande",
    error: Object.assign(new Error("Payload Too Large"), { status: 413 }),
    online: true,
    kind: "too-large",
  },
  {
    nombre: "demasiadas peticiones",
    error: Object.assign(new Error("Too Many Requests"), { status: 429 }),
    online: true,
    kind: "rate-limit",
  },
  {
    nombre: "error del servidor",
    error: Object.assign(new Error("Internal Server Error"), { status: 500 }),
    online: true,
    kind: "server",
  },
  {
    nombre: "algo que ni siquiera es un Error",
    error: { raro: true },
    online: true,
    kind: "server",
  },
] as const;

for (const caso of casos) {
  const aviso = describeCadSaveFailure(caso.error, { online: caso.online });

  ok(aviso.kind === caso.kind, `${caso.nombre}: se clasifica como «${caso.kind}»`);

  const completo = `${aviso.title} ${aviso.message}`;
  const delator = JERGA.find((patron) => patron.test(completo));
  ok(!delator, `${caso.nombre}: no enseña jerga (${delator ?? "limpio"})`);

  ok(
    aviso.title.length > 3 && aviso.title.length <= 40,
    `${caso.nombre}: el título es un titular, no un párrafo`,
  );

  // QUÉ PASA CON SU TRABAJO. Es la pregunta que la persona tiene en la cabeza.
  ok(
    /tus cambios|tus planos|en este equipo|siguen siendo tuyos/iu.test(aviso.message),
    `${caso.nombre}: dice qué pasa con el trabajo del usuario`,
  );

  // QUÉ PUEDE HACER. Un aviso sin salida es una pared.
  ok(
    /vuelve a|espera|divide|renueva|p[íi]dele|puedes|exporta/iu.test(aviso.message),
    `${caso.nombre}: ofrece una salida concreta`,
  );

  ok(
    /[áéíóúñ¿¡]/u.test(completo),
    `${caso.nombre}: está escrito en español, no en inglés traducido a medias`,
  );
}

/* ── La regla de oro de la campaña, dicha en el momento que le toca ──────── */
{
  const aviso = describeCadSaveFailure(
    Object.assign(new Error("403"), {
      status: 403,
      body: { details: { reason: "read_only_after_lapse" } },
    }),
    { online: true },
  );
  ok(
    /export/iu.test(aviso.message) && /DXF/u.test(aviso.message),
    "al expirar la prueba, el aviso dice EXPLÍCITAMENTE que puede exportar: es la promesa de no-rehenes, en el instante en que el usuario duda de ella",
  );
  ok(
    !/paga|pagar ya|se perder/iu.test(aviso.message),
    "y no amenaza con perder nada, porque no se pierde nada",
  );
}

/* ── Un 403 corriente NO puede disfrazarse de expiración ─────────────────── */
{
  const aviso = describeCadSaveFailure(
    Object.assign(new Error("403"), { status: 403 }),
    { online: true },
  );
  ok(
    aviso.kind === "permission",
    "un 403 sin la razón de expiración es falta de permiso, no un periodo terminado",
  );
}

/* ── La red gana sólo cuando NO hay estado HTTP ──────────────────────────── */
{
  // Un 500 con el navegador desconectado sigue siendo un 500: el servidor
  // contestó, así que decirle «no hay conexión» sería mentirle.
  const aviso = describeCadSaveFailure(
    Object.assign(new Error("boom"), { status: 500 }),
    { online: false },
  );
  ok(
    aviso.kind === "server",
    "si el servidor llegó a contestar, el aviso no puede echarle la culpa a la red",
  );
}

/* ── Sin `online` explícito, el módulo pregunta al navegador ─────────────── */
{
  // En Node no hay `navigator`, así que el respaldo es «conectado»: un error
  // con estado HTTP se clasifica por su estado y no por una red inventada.
  const aviso = describeCadSaveFailure(
    Object.assign(new Error("x"), { status: 401 }),
  );
  ok(
    aviso.kind === "session",
    "sin `online` explícito sigue clasificando por el estado que trae el error",
  );
}

console.log(
  `avisos de guardado fallido: ${checks} comprobaciones · ${casos.length} fallos descritos en español con salida`,
);
