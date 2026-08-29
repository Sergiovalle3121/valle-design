/**
 * EL CONTRATO DE LAS PRIMITIVAS, EN ASERCIONES.
 *
 * ## Por qué faltaba
 *
 * `design-system.spec.ts` es un gate ESTÁTICO: recorre los `.tsx` buscando
 * hexes sueltos y tamaños fuera de escala. Nunca renderiza nada. Así que hasta
 * hoy el sistema de diseño tenía una red contra la deriva de estilo y **ninguna
 * contra la deriva de comportamiento**: se podía quitar un `role`, un
 * `aria-selected` o el `type="button"` de un botón y todo seguía verde.
 *
 * No es hipotético. El fallo de foco de `Modal` que esta campaña arregló —el
 * efecto se remontaba en cada render del padre y devolvía el foco al primer
 * control con cada tecla escrita— vivió en el repo sin que ningún gate lo
 * mirara.
 *
 * ## Qué se prueba y qué no
 *
 * Se renderiza a marcado estático y se comprueba lo que un lector de pantalla
 * y el navegador leen del HTML: roles, nombres accesibles, estados, y el
 * `type` de los botones. Lo que exige un DOM vivo —trampa de foco, flechas
 * entre pestañas, Escape— se prueba en `e2e/a11y/teclado-embudo.spec.ts`, con
 * un navegador de verdad. Aquí no se finge lo que sin DOM no se puede saber.
 *
 * Correr:  npx tsx src/components/ui/primitives-contract.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { Button } from "./Button";
import { Badge, ProgressBar, Skeleton } from "./Feedback";
import { Input, Select, Textarea } from "./Input";
import { Tabs } from "./Tabs";
import { Checkbox, Switch } from "./Toggle";

/* ── Button ───────────────────────────────────────────────────────────────── */
{
  const html = render(createElement(Button, {}, "Guardar"));
  assert.match(
    html,
    /type="button"/,
    'sin type="button" un botón dentro de un <form> lo ENVÍA al pulsarlo — el ' +
      "fallo clásico que convierte «cancelar» en «enviar»",
  );
  assert.match(html, /Guardar/, "la etiqueta se conserva");
}
{
  // `loading` deshabilita CONSERVANDO la etiqueta: un botón que la sustituye por
  // un spinner encoge y mueve todo lo que tiene al lado.
  const html = render(createElement(Button, { loading: true }, "Guardar"));
  assert.match(html, /disabled/, "cargando implica deshabilitado");
  assert.match(html, /Guardar/, "la etiqueta sobrevive al estado de carga");
  assert.match(
    html,
    /aria-busy="true"/,
    "un lector de pantalla tiene que saber que hay trabajo en curso",
  );
}

/* ── Input / Select / Textarea ────────────────────────────────────────────── */
{
  const html = render(
    createElement(Input, { label: "Correo", name: "email", required: true }),
  );
  assert.match(html, /<label/, "un campo sin etiqueta no es un campo");
  assert.match(
    html,
    /for="[^"]+"[\s\S]*?id="[^"]+"|id="([^"]+)"[\s\S]*?for="\1"/,
    "la etiqueta tiene que apuntar al control por id",
  );
}
{
  // El mensaje de error se anuncia y se enlaza; si no, quien no ve la pantalla
  // sabe que el envío falló y no por qué.
  const html = render(
    createElement(Input, {
      label: "Correo",
      name: "email",
      error: "Ese correo no existe",
    }),
  );
  assert.match(html, /Ese correo no existe/);
  assert.match(html, /aria-invalid="true"/, "el control se marca como inválido");
  assert.match(html, /aria-describedby=/, "y el mensaje se enlaza al control");
}
{
  const html = render(
    createElement(
      Select,
      {
        label: "Papel",
        name: "paper",
        children: createElement("option", { value: "a4" }, "A4"),
      },
    ),
  );
  assert.match(html, /<label/);
  assert.match(html, /<select/);
}
{
  const html = render(createElement(Textarea, { label: "Notas", name: "notes" }));
  assert.match(html, /<label/);
  assert.match(html, /<textarea/);
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
{
  const html = render(
    createElement(Tabs, {
      label: "Secciones",
      value: "b",
      onChange: () => {},
      items: [
        { id: "a", label: "Uno" },
        { id: "b", label: "Dos" },
      ],
    }),
  );
  assert.match(html, /role="tablist"/, "sin tablist no hay pestañas, hay botones");
  assert.match(html, /aria-label="Secciones"/, "la lista se nombra");
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected="true"/, "la pestaña activa se anuncia");
  assert.match(
    html,
    /tabindex="-1"/,
    "las pestañas inactivas salen del orden de tabulación: dentro de la lista se " +
      "navega con flechas, que es lo que exige el patrón",
  );
}

/* ── Toggle: Checkbox y Switch ────────────────────────────────────────────── */
{
  const html = render(createElement(Checkbox, { label: "Adjuntar contexto" }));
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Adjuntar contexto/);
  assert.match(html, /<label/, "la casilla se activa pulsando su texto");
}
{
  const html = render(
    createElement(Switch, {
      label: "Modo oscuro",
      checked: true,
      onCheckedChange: () => {},
    }),
  );
  assert.match(html, /role="switch"|type="checkbox"/, "un interruptor se anuncia como tal");
  assert.match(html, /Modo oscuro/);
}

/* ── Feedback: Badge, ProgressBar, Skeleton ───────────────────────────────── */
{
  const html = render(
    createElement(Badge, { tone: "danger", children: "3 errores" }),
  );
  assert.match(html, /3 errores/);
}
{
  const html = render(createElement(ProgressBar, { value: 40, label: "Importando" }));
  assert.match(html, /role="progressbar"/, "una barra sin rol es una caja de color");
  assert.match(html, /aria-valuenow="40"/, "y sin valor no informa de nada");
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
}
{
  const html = render(createElement(Skeleton, { className: "h-4 w-10" }));
  assert.match(
    html,
    /aria-hidden="true"/,
    "un esqueleto es decoración: si el lector de pantalla lo lee, anuncia cajas vacías",
  );
}

console.log("contrato de las primitivas: 24/24");
