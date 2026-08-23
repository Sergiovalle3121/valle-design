import { strict as assert } from "node:assert";
import {
  missingRequiredAcceptances,
  hasAcceptedCurrentTerms,
  type LegalAcceptanceRecord,
  type LegalDocumentVersion,
} from "./acceptance-gate";

/**
 * Espejo deliberado de `apps/api/src/modules/legal/legal-documents.ts`
 * (`LEGAL_DOCUMENTS`): los términos exigen aceptación explícita, el aviso de
 * privacidad NO (se acredita entrega, no consentimiento — ver el comentario
 * del API). Este módulo no importa el del API porque no comparten build
 * (web/api son procesos distintos); recibe la lista tal cual la devolvería
 * `GET /v1/legal/documents`.
 */
const documents: LegalDocumentVersion[] = [
  { documento: "terms", version: "2026-08-15", requiereAceptacion: true },
  { documento: "privacy", version: "2026-08-15", requiereAceptacion: false },
];

// ── Rojo: sin ninguna aceptación registrada, términos falta ────────────────
{
  const missing = missingRequiredAcceptances(documents, []);
  assert.deepEqual(
    missing.map((d) => d.documento),
    ["terms"],
  );
  assert.equal(hasAcceptedCurrentTerms(documents, []), false);
}

// ── Verde: aceptación registrada contra la versión VIGENTE ─────────────────
{
  const acceptances: LegalAcceptanceRecord[] = [
    { document: "terms", version: "2026-08-15" },
  ];
  assert.deepEqual(missingRequiredAcceptances(documents, acceptances), []);
  assert.equal(hasAcceptedCurrentTerms(documents, acceptances), true);
}

// ── Adversarial: aceptación de una versión VIEJA no cuenta ─────────────────
// Un cambio de versión de términos debe forzar nueva aceptación: aceptar
// "2026-01-01" cuando lo vigente es "2026-08-15" no acredita nada sobre el
// texto actual.
{
  const acceptances: LegalAcceptanceRecord[] = [
    { document: "terms", version: "2026-01-01" },
  ];
  assert.deepEqual(
    missingRequiredAcceptances(documents, acceptances).map((d) => d.documento),
    ["terms"],
  );
  assert.equal(hasAcceptedCurrentTerms(documents, acceptances), false);
}

// ── Adversarial: privacidad nunca bloquea, aunque no tenga aceptación ──────
// `requiereAceptacion: false` es la señal de que ese documento se acredita
// por entrega, no por consentimiento explícito (mismo criterio que el API).
{
  const acceptances: LegalAcceptanceRecord[] = [
    { document: "terms", version: "2026-08-15" },
  ];
  const missing = missingRequiredAcceptances(documents, acceptances);
  assert.deepEqual(missing, []);
}

// ── Adversarial: aceptación del documento equivocado no cubre términos ─────
{
  const acceptances: LegalAcceptanceRecord[] = [
    { document: "privacy", version: "2026-08-15" },
  ];
  assert.equal(hasAcceptedCurrentTerms(documents, acceptances), false);
}

// ── Adversarial: sin `terms` en el registro (API caído a medias), fallo
// cerrado — no se asume que "sin documento conocido" equivale a "aceptado".
{
  const noTerms: LegalDocumentVersion[] = [
    { documento: "privacy", version: "2026-08-15", requiereAceptacion: false },
  ];
  assert.equal(hasAcceptedCurrentTerms(noTerms, []), false);
  assert.deepEqual(missingRequiredAcceptances(noTerms, []), []);
}

console.log(
  "acceptance-gate: los términos vigentes bloquean sin aceptación exacta de versión; privacidad nunca bloquea; una versión vieja no cuenta",
);
