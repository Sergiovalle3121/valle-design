import type { Metadata } from "next";
import { AccountSecurity } from "./AccountSecurity";

/**
 * LA CUENTA — donde el usuario puede VIGILAR su cuenta, no sólo tenerla.
 *
 * `robots: noindex` como el resto del área privada: aquí no hay nada que
 * indexar y la ruta sólo tiene sentido con sesión.
 */
export const metadata: Metadata = {
  title: "Tu cuenta",
  robots: { index: false, follow: false },
};

export default function CuentaPage() {
  return <AccountSecurity />;
}
