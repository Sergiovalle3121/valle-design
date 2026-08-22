"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

/**
 * BOTÓN DE REENVÍO CON TEMPORIZADOR.
 *
 * Un botón de «volver a enviar» sin espera es una invitación a pulsarlo cinco
 * veces: el correo tarda unos segundos, no pasa nada, y el usuario insiste. El
 * resultado es cinco correos, cinco tokens —cuatro de ellos inválidos en cuanto
 * se usa el último— y una carpeta de no deseado que empieza a mirar mal al
 * dominio.
 *
 * La cuenta atrás no es una traba: es la respuesta a «¿lo pulsé bien?». Mientras
 * corre, el botón DICE cuánto falta, así que la espera está explicada.
 *
 * `aria-live="polite"` en el texto del contador: quien no ve la pantalla también
 * necesita saber que hay una espera y de cuánto. `polite` y no `assertive`
 * porque anunciar cada segundo interrumpiendo sería insufrible — el lector
 * anuncia cuando le toca turno.
 */
export function ResendTimerButton({
  seconds = 60,
  onResend,
  label = "Enviar otro correo",
  className,
}: {
  seconds?: number;
  onResend: () => void | Promise<void>;
  label?: string;
  className?: string;
}) {
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    // `setTimeout` encadenado y no `setInterval`: si la pestaña se duerme, el
    // intervalo acumula disparos y al volver descuenta varios segundos de
    // golpe. Con el timeout, cada tic se programa cuando el anterior corre.
    const timer = setTimeout(() => setLeft((value) => value - 1), 1_000);
    return () => clearTimeout(timer);
  }, [left]);

  const send = async () => {
    if (left > 0 || busy) return;
    setBusy(true);
    try {
      await onResend();
      setLeft(seconds);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Button
        variant="secondary"
        fullWidth
        loading={busy}
        disabled={left > 0}
        onClick={() => void send()}
        data-testid="resend-verification"
      >
        {left > 0 ? `Puedes reenviar en ${left} s` : label}
      </Button>
      {left > 0 ? (
        <p aria-live="polite" className="sr-only">
          Podrás enviar otro correo en {left} segundos.
        </p>
      ) : null}
    </div>
  );
}
