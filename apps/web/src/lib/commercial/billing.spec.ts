import { strict as assert } from "node:assert";
import {
  cancellationWarning,
  formatDate,
  invoiceRow,
  invoiceStatusLabel,
  renewalNote,
  subscriptionStatusLabel,
  type Invoice,
  type Subscription,
} from "./billing";

const base: Subscription = {
  planCode: "despacho",
  status: "active",
  trialEndsAt: null,
  currentPeriodEnd: "2026-09-16T14:30:00.000Z",
  cancelAtPeriodEnd: false,
  seats: 3,
  effective: true,
};

assert.equal(subscriptionStatusLabel("trialing"), "En periodo de prueba");
assert.equal(subscriptionStatusLabel("past_due"), "Pago pendiente");
assert.equal(subscriptionStatusLabel("cancelled"), "Cancelada");

assert.equal(
  formatDate("2026-09-16T14:30:00.000Z"),
  "16 de septiembre de 2026",
);
assert.equal(formatDate(null), null);
assert.equal(formatDate("no es una fecha"), null);

// La renovación y el fin de acceso NO se llaman igual: confundirlos es lo que
// hace que alguien cancele y siga esperando el cargo.
assert.match(renewalNote(base), /Se renueva el 16 de septiembre de 2026/u);
assert.match(
  renewalNote({ ...base, cancelAtPeriodEnd: true }),
  /conservas el acceso hasta el 16 de septiembre de 2026/iu,
);
assert.match(
  renewalNote({ ...base, status: "cancelled" }),
  /cancelada y no se renovará/iu,
);
assert.match(
  renewalNote({
    ...base,
    status: "trialing",
    trialEndsAt: "2026-08-30T14:30:00.000Z",
  }),
  /La prueba termina el 30 de agosto de 2026/u,
);
assert.match(
  renewalNote({ ...base, currentPeriodEnd: null }),
  /Sin fecha de renovación registrada/u,
);

// El aviso de baja dice lo que de verdad ocurre: el acceso NO se corta hoy.
const warning = cancellationWarning(base);
assert.match(warning, /NO corta el servicio ahora mismo/u);
assert.match(warning, /16 de septiembre de 2026/u);
assert.match(
  cancellationWarning({ ...base, currentPeriodEnd: null }),
  /final del periodo en curso/u,
);

assert.equal(invoiceStatusLabel("paid"), "Pagada");
assert.equal(invoiceStatusLabel("open"), "Pendiente de pago");
assert.equal(invoiceStatusLabel("void"), "Anulada");

const invoice: Invoice = {
  id: "3f0f2b6a-0000-4000-8000-000000000000",
  number: "A-0001",
  amountCents: 50700,
  currency: "MXN",
  status: "paid",
  periodStart: "2026-08-16T14:30:00.000Z",
  periodEnd: "2026-09-16T14:30:00.000Z",
  hostedUrl: "https://pagos.example.com/facturas/A-0001",
  issuedAt: "2026-08-16T10:00:00.000Z",
};
const row = invoiceRow(invoice);
assert.equal(row.label, "A-0001");
assert.equal(row.amount, "$507.00");
assert.equal(row.status, "Pagada");
assert.equal(row.period, "16 de agosto de 2026 – 16 de septiembre de 2026");
assert.equal(row.hostedUrl, "https://pagos.example.com/facturas/A-0001");

// Un borrador sin número se identifica por su id, no por una cadena vacía.
assert.equal(invoiceRow({ ...invoice, number: null }).label, invoice.id);
// Un enlace que no sea HTTPS no es el documento fiscal: no se ofrece.
for (const hostile of [
  "javascript:alert(1)",
  "http://pagos.example.com/A-0001",
  "no-es-una-url",
  null,
]) {
  assert.equal(invoiceRow({ ...invoice, hostedUrl: hostile }).hostedUrl, null);
}

console.log(
  "billing: estados traducidos, baja explicada con su fecha real y enlaces de factura sólo si son HTTPS",
);
