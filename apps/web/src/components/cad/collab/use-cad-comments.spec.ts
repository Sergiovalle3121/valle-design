/**
 * `createWithRateLimitRetry`: un comentario no debe fallar en seco cuando el
 * techo de `reviewCommentsPerSession` (VD-RL-001, generoso a propósito) se
 * alcanza bajo una tormenta legítima — reintenta una vez, pasado el
 * `retryAfterSeconds` que el servidor ya calculó.
 *
 * npx tsx src/components/cad/collab/use-cad-comments.spec.ts
 */
import { DesignApiError } from "@/lib/cad/repositories/client";
import { createWithRateLimitRetry } from "./use-cad-comments";
import type { CadComment } from "@valle/design-sdk";
import type { CadCommentSource } from "./use-cad-comments";

let passed = 0;
const fails: string[] = [];
const ok = (cond: boolean, m: string) => {
  if (cond) passed++;
  else fails.push(m);
};

const rateLimited = (retryAfterSeconds: number) =>
  new DesignApiError(429, {
    code: "rate_limited",
    message: "Demasiadas peticiones; inténtalo más tarde.",
    retryAfterSeconds,
  });

const comment = (id: string): CadComment =>
  ({ id, body: "x", author: "a", resolved: false, createdAt: "now" }) as CadComment;

async function main() {
  // ── reintenta una vez tras un 429, y devuelve el éxito del segundo intento ──
  {
    let calls = 0;
    const errors: (string | null)[] = [];
    const source: CadCommentSource = {
      list: async () => ({ items: [] }),
      resolve: async () => comment("r"),
      create: async () => {
        calls++;
        if (calls === 1) throw rateLimited(0);
        return comment("ok-tras-reintento");
      },
    };
    const result = await createWithRateLimitRetry(
      source,
      { body: "hola", anchor: null },
      (message) => errors.push(message),
    );
    ok(calls === 2, "create() se llamó dos veces: el intento original y el reintento");
    ok(result.id === "ok-tras-reintento", "el resultado es el del reintento exitoso");
    ok(
      errors.length === 1 && !!errors[0] && /reintentando/.test(errors[0]),
      "avisó UNA vez, con un mensaje que dice que está reintentando (no un error final)",
    );
  }

  // ── un segundo 429 seguido no reintenta de nuevo: lo decide quien llama ──
  {
    let calls = 0;
    const source: CadCommentSource = {
      list: async () => ({ items: [] }),
      resolve: async () => comment("r"),
      create: async () => {
        calls++;
        throw rateLimited(0);
      },
    };
    let threw: unknown = null;
    try {
      await createWithRateLimitRetry(source, { body: "hola", anchor: null }, () => {});
    } catch (cause) {
      threw = cause;
    }
    ok(calls === 2, "sólo UN reintento — no un bucle: dos llamadas en total, no más");
    ok(
      threw instanceof DesignApiError && threw.isRateLimited(),
      "si el reintento también se limita, el error sale hacia quien llamó",
    );
  }

  // ── un error que NO es de rate-limit no se reintenta: sale de inmediato ──
  {
    let calls = 0;
    const boom = new Error("otra cosa se rompió");
    const source: CadCommentSource = {
      list: async () => ({ items: [] }),
      resolve: async () => comment("r"),
      create: async () => {
        calls++;
        throw boom;
      },
    };
    let threw: unknown = null;
    try {
      await createWithRateLimitRetry(source, { body: "hola", anchor: null }, () => {
        fails.push("no debería avisar de reintento para un error que no es 429");
      });
    } catch (cause) {
      threw = cause;
    }
    ok(calls === 1, "un error ajeno al rate-limit no dispara reintento: una sola llamada");
    ok(threw === boom, "el error original sale intacto, sin envolver ni tragarlo");
  }

  // ── éxito al primer intento: sin reintento, sin aviso ──
  {
    let calls = 0;
    let warned = false;
    const source: CadCommentSource = {
      list: async () => ({ items: [] }),
      resolve: async () => comment("r"),
      create: async () => {
        calls++;
        return comment("directo");
      },
    };
    const result = await createWithRateLimitRetry(
      source,
      { body: "hola", anchor: null },
      () => {
        warned = true;
      },
    );
    ok(calls === 1, "camino feliz: una sola llamada");
    ok(!warned, "camino feliz: nunca se llama al aviso de reintento");
    ok(result.id === "directo", "devuelve el resultado del único intento");
  }

  if (fails.length) {
    console.log(`❌ ${passed}/${passed + fails.length}`);
    for (const f of fails) console.log("  - " + f);
    process.exit(1);
  }
  console.log(`✅ ${passed}/${passed} use-cad-comments`);
}

void main();
