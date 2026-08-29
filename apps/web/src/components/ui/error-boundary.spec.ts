/**
 * La frontera de error: qué acota y qué enseña cuando acota.
 *
 * Se prueba SIN DOM. Una frontera de React sólo entra en acción durante el
 * render del cliente, y montar un árbol de verdad aquí exigiría jsdom, que este
 * repo no usa en las suites `tsx`. Lo que sí se puede probar sin navegador es lo
 * que decide el comportamiento entero:
 *
 *   1. `getDerivedStateFromError` guarda el error (si no, no hay frontera).
 *   2. Sin error, los hijos pasan TAL CUAL — sin envoltorio, sin clonar. Una
 *      frontera que envuelve su contenido en un `div` rompe cualquier layout de
 *      rejilla en el que se meta, y eso se descubre en la pantalla, tarde.
 *   3. Con error, el marcado lleva `role="alert"`, el nombre de la zona y una
 *      salida para el usuario. Sin `role="alert"` el lector de pantalla no
 *      anuncia nada: la mitad de la sala se queda sin saber que algo se cayó.
 *   4. Reintentar limpia el estado, que es lo que permite remontar sin recargar.
 *
 * Correr:  npx tsx src/components/ui/error-boundary.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary } from "./ErrorBoundary";

function frontera(props: Record<string, unknown>) {
  // Se instancia la clase a mano: `render()` es una función pura del estado y
  // de las props, así que no hace falta un reconciliador para interrogarla.
  const instancia = new (ErrorBoundary as unknown as new (
    p: Record<string, unknown>,
  ) => {
    state: { error: Error | null };
    props: Record<string, unknown>;
    render: () => unknown;
    setState: (s: { error: Error | null }) => void;
  })(props);
  instancia.props = props;
  return instancia;
}

/* ── 1 · El error se guarda ────────────────────────────────────────────────── */
{
  const boom = new Error("la paleta explotó");
  const siguiente = (
    ErrorBoundary as unknown as {
      getDerivedStateFromError: (e: Error) => { error: Error | null };
    }
  ).getDerivedStateFromError(boom);
  assert.equal(siguiente.error, boom, "la frontera debe quedarse con el error");
}

/* ── 2 · Sin error, los hijos pasan tal cual ───────────────────────────────── */
{
  const hijos = createElement("p", { id: "intacto" }, "contenido");
  const instancia = frontera({ zona: "Paleta", children: hijos });
  instancia.state = { error: null };
  assert.equal(
    instancia.render(),
    hijos,
    "sin error, la frontera devuelve sus hijos SIN envolverlos",
  );
}

/* ── 3 · Con error, tarjeta anunciada y con salida ─────────────────────────── */
{
  const instancia = frontera({ zona: "Paleta de propiedades", children: null, compacta: true });
  instancia.state = { error: new Error("boom") };
  const html = renderToStaticMarkup(instancia.render() as ReactElement);
  assert.match(html, /role="alert"/, "la caída tiene que anunciarse");
  assert.match(html, /Paleta de propiedades/, "la tarjeta nombra la zona que se cayó");
  assert.match(html, /Reintentar/, "tiene que haber una salida sin recargar la página");
  assert.doesNotMatch(
    html,
    /boom/,
    "el mensaje crudo del error no se le enseña al usuario: puede filtrar la forma interna",
  );
}

/* ── 4 · Reintentar limpia el estado ───────────────────────────────────────── */
{
  const instancia = frontera({ zona: "Lienzo", children: null });
  instancia.state = { error: new Error("boom") };
  let guardado: { error: Error | null } | null = null;
  instancia.setState = (s) => {
    guardado = s;
  };
  // `reintentar` es privado pero es el manejador del botón; se alcanza por su
  // nombre porque probarlo por la interfaz exigiría el DOM que este spec evita.
  (instancia as unknown as { reintentar: () => void }).reintentar();
  assert.deepEqual(guardado, { error: null }, "reintentar vuelve a montar el subárbol");
}

console.log("frontera de error: 4/4");
