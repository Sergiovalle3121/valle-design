import type { Metadata } from "next";
import { TeamRoom } from "./TeamRoom";

/**
 * EL EQUIPO — y, para un profesor, el aula.
 *
 * `robots: noindex` como el resto del área privada: la ruta sólo tiene sentido
 * con sesión y no hay nada que indexar.
 */
export const metadata: Metadata = {
  title: "Tu equipo",
  robots: { index: false, follow: false },
};

export default function EquipoPage() {
  return <TeamRoom />;
}
