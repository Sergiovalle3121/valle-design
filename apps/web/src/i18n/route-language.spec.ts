import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { isBilingualRoute } from "./route-language";

// ── T-18d / T-63e: sólo el estudio y la página sin conexión son bilingües ──
for (const pathname of [
  "/studio",
  "/studio/abc-123",
  "/studio/abc-123/subruta",
  "/sin-conexion",
]) {
  assert.ok(
    isBilingualRoute(pathname),
    `${pathname} debería contar como ruta bilingüe`,
  );
}

for (const pathname of [
  "/",
  "/precios",
  "/dashboard",
  "/cuenta",
  "/cuenta/facturacion",
  "/login",
  "/register",
  "/faq",
  "/studio-no-es-la-misma-ruta",
  "/sin-conexion-tampoco",
]) {
  assert.ok(
    !isBilingualRoute(pathname),
    `${pathname} es español escrito a mano: no debe contar como bilingüe`,
  );
}

// ── El layout raíz usa esta puerta, no la cookie de idioma, para <html lang> ──
const layout = readFileSync("src/app/layout.tsx", "utf8");
assert.ok(
  layout.includes("isBilingualRoute(pathname)"),
  "layout.tsx debe decidir <html lang> con isBilingualRoute, no con la cookie a secas",
);
assert.match(
  layout,
  /isBilingualRoute\(pathname\)\s*\?\s*locale\s*:\s*"es"/u,
  'fuera de las rutas bilingües, <html lang> debe ser "es" — es lo que el DOM contiene de verdad',
);

// ── El middleware reenvía la ruta y no toca cookies, cuerpo ni redirecciones ──
const middleware = readFileSync("src/middleware.ts", "utf8");
assert.ok(
  middleware.includes("PATHNAME_HEADER"),
  "el middleware debe reenviar la ruta con la misma clave que route-language.ts declara",
);
assert.doesNotMatch(
  middleware,
  /redirect|NextResponse\.rewrite|cookies\(\)\.set/u,
  "este middleware tiene un único propósito: reenviar la ruta, nada más",
);

console.log(
  "route-language: <html lang> declara español fuera del estudio y de la página sin conexión",
);
