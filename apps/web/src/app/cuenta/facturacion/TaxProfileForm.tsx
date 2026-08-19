"use client";

import { useEffect, useMemo, useState } from "react";
import { designClient } from "@/lib/cad/repositories/client";
import {
  cfdiUsesFor,
  fiscalIssuesFromError,
  FISCAL_HINTS,
  FISCAL_LABELS,
  issuanceNotice,
  keepCompatibleCfdiUse,
  localFiscalIssues,
  normalizeRfcInput,
  personTypeLabel,
  personTypeOf,
  regimesFor,
  RFC_VALIDATION_NOTICE,
  toFormValues,
  type FiscalField,
  type SatTaxCatalogs,
  type TaxProfileResponse,
  type TaxProfileSave,
} from "@/lib/commercial/fiscal";

type Phase =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "failed"; message: string }
  | { status: "unreadable"; message: string };

export interface TaxProfileFormProps {
  /** Se avisa al terminar para que el llamador retome lo que estuviera haciendo. */
  onSaved?: (response: TaxProfileResponse) => void;
  /** Texto del botón: en el checkout no dice lo mismo que en el portal. */
  submitLabel?: string;
}

/**
 * CAPTURA FISCAL para el CFDI 4.0.
 *
 * Tres decisiones que parecen de formulario y son de negocio:
 *
 * - Los desplegables se FILTRAN. El régimen se filtra por el tipo de persona
 *   que se deduce del RFC, y el uso del CFDI por el régimen elegido. Ofrecer
 *   una combinación que el SAT rechaza es prepararle al cliente una factura
 *   inválida con su propio consentimiento, y el error aparecería meses después,
 *   cuando ya pagó.
 *
 * - Los errores del servidor se pintan JUNTO A SU CAMPO. La API devuelve los
 *   cinco a la vez precisamente para esto: descubrirlos de uno en uno es la
 *   forma más rápida de que alguien abandone justo antes de pagar.
 *
 * - El aviso de emisión NO promete lo que el producto no hace. Mientras no haya
 *   PAC contratado, dice que la factura la emite el equipo con estos datos. La
 *   frase viene del descriptor que publica la API, no de una constante local,
 *   para que el día que haya PAC cambie sola.
 */
export function TaxProfileForm({ onSaved, submitLabel }: TaxProfileFormProps) {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [catalogs, setCatalogs] = useState<SatTaxCatalogs | null>(null);
  const [issuance, setIssuance] = useState<TaxProfileResponse["issuance"] | null>(
    null,
  );
  const [values, setValues] = useState<TaxProfileSave>(toFormValues(null));
  const [issues, setIssues] = useState<Partial<Record<FiscalField, string>>>({});

  // Catálogos y perfil se leen a la vez: el formulario no puede pintarse sin
  // los primeros, y sin el segundo no sabría si está capturando o corrigiendo.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [satCatalogs, current] = await Promise.all([
          designClient.commercial.taxCatalogs(),
          designClient.commercial.taxProfile(),
        ]);
        if (cancelled) return;
        setCatalogs(satCatalogs);
        setIssuance(current.issuance);
        setValues(toFormValues(current.profile));
        setPhase({ status: "ready" });
      } catch (error) {
        if (cancelled) return;
        setPhase({
          status: "unreadable",
          message:
            error instanceof Error
              ? error.message
              : "No pudimos cargar los catálogos del SAT.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const personType = personTypeOf(values.rfc);
  const regimes = useMemo(
    () => (catalogs ? regimesFor(catalogs, personType) : []),
    [catalogs, personType],
  );
  const uses = useMemo(
    () => (catalogs ? cfdiUsesFor(catalogs, values.taxRegimeCode) : []),
    [catalogs, values.taxRegimeCode],
  );

  const update = (field: FiscalField, value: string) => {
    setValues((current) => {
      const next = { ...current, [field]: value };
      // Cambiar el régimen puede dejar el uso elegido fuera de la ley. Se
      // olvida en vez de conservarlo: un campo que parece relleno y que el
      // servidor rechaza es peor que un campo vacío.
      if (field === "taxRegimeCode" && catalogs) {
        next.cfdiUseCode = keepCompatibleCfdiUse(
          catalogs,
          value,
          current.cfdiUseCode,
        );
      }
      return next;
    });
    setIssues((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    const local = localFiscalIssues(values);
    if (Object.keys(local).length > 0) {
      setIssues(local);
      setPhase({ status: "ready" });
      return;
    }
    setPhase({ status: "saving" });
    try {
      const saved = await designClient.commercial.saveTaxProfile({
        ...values,
        rfc: normalizeRfcInput(values.rfc),
      });
      setIssuance(saved.issuance);
      setValues(toFormValues(saved.profile));
      setIssues({});
      setPhase({ status: "saved" });
      onSaved?.(saved);
    } catch (error) {
      const mapped = fiscalIssuesFromError(error);
      setIssues(mapped);
      setPhase({
        status: "failed",
        message:
          Object.keys(mapped).length > 0
            ? "Revisa los campos marcados: el SAT rechazaría estos datos."
            : error instanceof Error
              ? error.message
              : "No pudimos guardar tus datos fiscales.",
      });
    }
  };

  if (phase.status === "loading") {
    return <p role="status">Cargando los catálogos del SAT…</p>;
  }
  if (phase.status === "unreadable") {
    return (
      <p role="alert" data-testid="fiscal-unreadable">
        {phase.message}
      </p>
    );
  }

  return (
    <form
      className="mt-4 space-y-4"
      data-testid="tax-profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {issuance && (
        <p
          className="rounded-2xl border border-black/10 p-4 text-sm dark:border-white/10"
          data-testid="issuance-notice"
        >
          {issuanceNotice(issuance)}
        </p>
      )}

      <Field
        field="rfc"
        value={values.rfc}
        issue={issues.rfc}
        onChange={(value) => update("rfc", normalizeRfcInput(value))}
        extra={
          personType ? (
            <span className="text-xs text-gray-500" data-testid="person-type">
              {personTypeLabel(personType)}
            </span>
          ) : null
        }
      />
      <Field
        field="legalName"
        value={values.legalName}
        issue={issues.legalName}
        onChange={(value) => update("legalName", value)}
      />

      <Select
        field="taxRegimeCode"
        value={values.taxRegimeCode}
        issue={issues.taxRegimeCode}
        onChange={(value) => update("taxRegimeCode", value)}
        options={regimes.map((regime) => ({
          value: regime.code,
          label: `${regime.code} — ${regime.name}`,
        }))}
        placeholder="Elige tu régimen"
      />
      <Select
        field="cfdiUseCode"
        value={values.cfdiUseCode}
        issue={issues.cfdiUseCode}
        onChange={(value) => update("cfdiUseCode", value)}
        options={uses.map((use) => ({
          value: use.code,
          label: `${use.code} — ${use.name}`,
        }))}
        placeholder={
          values.taxRegimeCode
            ? "Elige el uso del CFDI"
            : "Elige antes tu régimen fiscal"
        }
      />
      <Field
        field="postalCode"
        value={values.postalCode}
        issue={issues.postalCode}
        onChange={(value) => update("postalCode", value.replace(/\D/gu, ""))}
      />

      <p className="text-xs text-gray-500" data-testid="rfc-notice">
        {RFC_VALIDATION_NOTICE}
      </p>

      {phase.status === "failed" && (
        <p role="alert" className="text-sm text-rose-600">
          {phase.message}
        </p>
      )}
      {phase.status === "saved" && (
        <p role="status" className="text-sm" data-testid="fiscal-saved">
          Datos fiscales guardados.
        </p>
      )}

      <button
        type="submit"
        className={fiscalActionClass}
        disabled={phase.status === "saving"}
        data-testid="save-tax-profile"
      >
        {phase.status === "saving"
          ? "Guardando…"
          : (submitLabel ?? "Guardar datos fiscales")}
      </button>
    </form>
  );
}

const fiscalActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-500 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-500/5 disabled:opacity-60 dark:text-indigo-200";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 dark:border-white/20";

function Field({
  field,
  value,
  issue,
  onChange,
  extra,
}: {
  field: FiscalField;
  value: string;
  issue?: string;
  onChange: (value: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        {FISCAL_LABELS[field]}
        {extra}
      </span>
      <input
        className={inputClass}
        name={field}
        value={value}
        aria-invalid={issue ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block text-xs text-gray-500">
        {FISCAL_HINTS[field]}
      </span>
      {issue && (
        <span role="alert" className="mt-1 block text-xs text-rose-600">
          {issue}
        </span>
      )}
    </label>
  );
}

function Select({
  field,
  value,
  issue,
  onChange,
  options,
  placeholder,
}: {
  field: FiscalField;
  value: string;
  issue?: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{FISCAL_LABELS[field]}</span>
      <select
        className={inputClass}
        name={field}
        value={value}
        aria-invalid={issue ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-gray-500">
        {FISCAL_HINTS[field]}
      </span>
      {issue && (
        <span role="alert" className="mt-1 block text-xs text-rose-600">
          {issue}
        </span>
      )}
    </label>
  );
}
