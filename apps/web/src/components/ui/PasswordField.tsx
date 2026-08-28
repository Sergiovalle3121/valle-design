"use client";

import { useId, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { controlClass, FieldShell } from "./Field";
import { cx, focusRing, motionBase, touchTarget } from "./styles";
import { assessPassword } from "@/lib/password-strength";

/**
 * EL CAMPO DE CONTRASEÑA, con lo que le faltaba al embudo de alta.
 *
 * ── LAS TRES COSAS QUE AÑADE Y POR QUÉ ──────────────────────────────────────
 *
 * 1 · MOSTRAR / OCULTAR. La razón número uno por la que alguien falla al
 *     registrarse es que tecleó mal una contraseña que no puede ver, y en un
 *     teléfono con teclado predictivo pasa constantemente. Ocultarla protege
 *     de quien mira por encima del hombro; poder revelarla protege del error
 *     que hace abandonar el alta. Se ofrecen las dos y decide quien escribe.
 *
 *     El botón NO está dentro de un `<label>` ni roba el foco del campo: es un
 *     `<button type="button">` con `aria-pressed`, así el lector de pantalla
 *     anuncia el estado y el Enter del formulario sigue enviando en vez de
 *     alternar la visibilidad.
 *
 * 2 · MEDIDOR DE FORTALEZA HONESTO. Ver `lib/password-strength.ts`: mide
 *     entropía y castiga los patrones que un atacante explota, en vez de
 *     premiar la mayúscula-número-símbolo que empuja a la gente hacia
 *     `P@ssw0rd1`. La barra dice el veredicto y, cuando hay algo que decir, el
 *     consejo concreto.
 *
 * 3 · COMPATIBILIDAD CON GESTORES DE CONTRASEÑAS. `autoComplete` correcto
 *     (`new-password` al registrarse, `current-password` al entrar) es lo que
 *     hace que 1Password, el llavero de Apple o el de Chrome ofrezcan generar y
 *     guardar. Un embudo que pelea con el gestor del usuario acaba lleno de
 *     contraseñas reutilizadas, que es el modo de fallo más común que existe.
 *
 * ── LO QUE EL MEDIDOR NO DEBE HACER ─────────────────────────────────────────
 * No bloquea el envío. El servidor exige doce caracteres y ésa es la regla; el
 * medidor informa. Un medidor que impide continuar convierte una ayuda en un
 * acertijo, y quien no adivina qué quiere la barra se va.
 */

export interface PasswordFieldProps {
  label: string;
  name: string;
  autoComplete: "new-password" | "current-password";
  /** El medidor sólo tiene sentido al ELEGIR una contraseña, no al teclearla. */
  showStrength?: boolean;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  defaultValue?: string;
  "data-testid"?: string;
}

const BARRA: Record<string, string> = {
  "muy-debil": "w-1/5 bg-danger",
  debil: "w-2/5 bg-warning",
  aceptable: "w-3/5 bg-warning",
  fuerte: "bg-success",
};

export function PasswordField({
  label,
  name,
  autoComplete,
  showStrength = false,
  hint,
  required,
  minLength = 12,
  maxLength = 128,
  disabled,
  defaultValue,
  ...rest
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const medidorId = useId();
  const assessment = useMemo(() => assessPassword(value), [value]);

  return (
    <FieldShell label={label} hint={hint} required={required}>
      {({ id, describedBy }) => (
        <div>
          <div className="relative">
            <input
              {...rest}
              id={id}
              name={name}
              type={visible ? "text" : "password"}
              autoComplete={autoComplete}
              required={required}
              minLength={minLength}
              maxLength={maxLength}
              disabled={disabled}
              defaultValue={defaultValue}
              onChange={(event) => setValue(event.target.value)}
              aria-describedby={
                showStrength && value
                  ? [describedBy, medidorId].filter(Boolean).join(" ")
                  : describedBy
              }
              className={controlClass(
                false,
                // Sitio para el botón: sin este relleno, el texto pasa por
                // debajo del icono en cuanto la contraseña es larga.
                cx(touchTarget, "type-small pr-12"),
              )}
            />
            <button
              type="button"
              onClick={() => setVisible((previo) => !previo)}
              aria-pressed={visible}
              aria-label={
                visible ? "Ocultar la contraseña" : "Mostrar la contraseña"
              }
              // `tabIndex={-1}` NO: quien navega con teclado también quiere
              // poder comprobar lo que escribió. El botón entra en el orden de
              // tabulación como cualquier control.
              className={cx(
                "absolute right-1 top-1/2 grid h-9 w-10 -translate-y-1/2 place-items-center rounded-control text-muted-foreground hover:text-foreground",
                motionBase,
                focusRing,
              )}
            >
              {visible ? (
                <EyeOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Eye aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>

          {showStrength && value ? (
            <div id={medidorId} className="mt-3">
              <div
                className="h-1 overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className={cx(
                    "h-full rounded-full transition-[width,background-color] motion-base",
                    BARRA[assessment.verdict],
                  )}
                  style={
                    assessment.verdict === "fuerte"
                      ? { width: `${Math.round(assessment.ratio * 100)}%` }
                      : undefined
                  }
                />
              </div>
              {/*
                Sin `role="status"`: la pantalla de alta ya tiene uno (el
                mensaje de `AuthShell`) y dos regiones vivas en la misma vista
                rompen la comprobación estricta de la suite de navegador. El
                texto está enlazado por `aria-describedby`, que es como un
                lector de pantalla lo anuncia junto al campo, que es donde
                importa.
              */}
              <p className="type-caption mt-2 text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {assessment.label}
                </span>
                {" · "}
                <span className="type-numeric">{assessment.bits}</span> bits
                estimados
                {assessment.advice ? ` · ${assessment.advice}` : ""}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
