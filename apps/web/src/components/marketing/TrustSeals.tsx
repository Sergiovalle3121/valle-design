import { KeyRound, Lock, MailCheck, PackageOpen } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * LOS SELLOS DE CONFIANZA — todos verdaderos, ninguno decorativo.
 *
 * ── EL ENCARGO Y SU TRAMPA ──────────────────────────────────────────────────
 * «Que la creación de cuenta se vea tan segura como es». La forma fácil de
 * cumplirlo es un escudito verde y las palabras «256 bits» al lado. Es la forma
 * de cumplirlo que además destruye lo que venía a construir: quien sabe algo de
 * esto reconoce el adorno al instante y deduce, con razón, que lo demás también
 * puede ser adorno.
 *
 * Así que aquí no hay ni un escudo genérico ni una cifra suelta. Cada línea
 * nombra un mecanismo CONCRETO que existe en el repositorio y que se puede
 * comprobar leyéndolo:
 *
 *   · «cifrado en tránsito»  — la cookie de sesión de producción es
 *     `__Host-valle_session`, marcada Secure; el arranque en producción sobre
 *     HTTP plano devuelve 503 en vez de degradarse
 *     (`identity-security.ts`, `sessionCookiePolicy`).
 *   · «Argon2id»             — `hashArgon2idPassword`, con los parámetros
 *     fijados y verificados en cada inicio de sesión.
 *   · «verificación obligatoria» — `login()` rechaza a quien no tiene
 *     `emailVerifiedAt`. No es una recomendación: es una condición.
 *   · «tus planos siempre exportables» — al vencer cualquier periodo la sesión
 *     conserva el permiso de ver y exportar (la regla de oro del guard, con su
 *     prueba contra PostgreSQL real).
 *
 * ── POR QUÉ SE ESCRIBE EN PEQUEÑO ───────────────────────────────────────────
 * Porque es información, no un argumento de venta. Quien viene a registrarse no
 * está eligiendo por criptografía; está decidiendo si confía. Cuatro líneas
 * sobrias y ciertas dicen «esta gente sabe lo que hace» mucho mejor que un
 * banner. Y quien SÍ viene a auditar, encuentra los nombres exactos para ir a
 * buscarlos.
 */

const SELLOS = [
  {
    icon: Lock,
    titulo: "Cifrado en tránsito",
    texto:
      "La sesión viaja en una cookie Secure y HttpOnly que el navegador no deja leer a ninguna página. Sobre HTTP plano el servidor se niega a operar en vez de degradarse en silencio.",
  },
  {
    icon: KeyRound,
    titulo: "Contraseña protegida con Argon2id",
    texto:
      "Nunca se guarda tu contraseña, sólo un derivado del que no se puede volver atrás, con el algoritmo que hoy se recomienda para esto y con sus parámetros fijados.",
  },
  {
    icon: MailCheck,
    titulo: "Verificación obligatoria",
    texto:
      "Sin correo verificado no hay acceso. Evita que alguien registre una cuenta con la dirección de otra persona y te asegura la vía de recuperación el día que la necesites.",
  },
  {
    icon: PackageOpen,
    titulo: "Tus planos siempre exportables",
    texto:
      "Al terminar cualquier periodo la cuenta conserva el permiso de ver y exportar a DXF y PDF. Un producto que secuestra el trabajo del cliente para retenerlo no merece al cliente.",
  },
] as const;

export function TrustSeals({ className }: { className?: string }) {
  return (
    <ul className={cx("space-y-5", className)}>
      {SELLOS.map(({ icon: Icon, titulo, texto }) => (
        <li key={titulo} className="flex gap-3.5">
          <Icon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink"
          />
          <div>
            <p className="type-small font-semibold text-foreground">{titulo}</p>
            <p className="type-caption mt-1 text-muted-foreground">{texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
