import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Share2, Users } from "lucide-react";
import { PublicPageShell, PublicSection } from "../docs/PublicPageShell";
import { Surface, buttonClass } from "@/components/ui";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

/**
 * EDUCACIÓN — la propuesta para escuelas, contada sin adelantar nada.
 *
 * ── LA IDEA DEL DUEÑO ───────────────────────────────────────────────────────
 * Alumnos y profesores usándolo gratis, compartiendo planos entre compañeros.
 * Es una buena idea comercial además de generosa: quien aprende a dibujar en
 * una herramienta la lleva puesta cuando entra a un despacho.
 *
 * ── POR QUÉ ESTA PÁGINA NO ANUNCIA UN PLAN ──────────────────────────────────
 * Porque el plan educativo gratuito está TRAS FLAG y apagado. Una página que
 * dijera «gratis para universidades» con un botón que lleva a un alta de pago
 * es la clase de promesa que quema a un profesor delante de su grupo, y un
 * profesor quemado no vuelve.
 *
 * Así que esta página hace dos cosas honestas a la vez: cuenta lo que YA se
 * puede hacer hoy con las herramientas que existen —organización, invitaciones,
 * enlaces de revisión, comentarios anclados— y recoge el interés de quien
 * quiera que le avisemos cuando el plan abra. Lo primero es útil desde hoy; lo
 * segundo no promete fecha.
 *
 * ── LO QUE FALTA PARA ENCENDERLO ────────────────────────────────────────────
 * Está escrito en el informe de la campaña: decidir la lista de dominios
 * institucionales que se aceptan y tener capacidad de soporte para un pico de
 * altas al principio de un semestre. Son decisiones del dueño, no de una
 * campaña.
 */

export const metadata: Metadata = publicPageMetadata({
  path: "/educacion",
  title: "Valle Design para escuelas y universidades",
  description:
    "Cómo un taller de proyectos puede usar Valle Design hoy: organización del grupo, invitaciones y revisión sobre el plano, más el plan educativo que preparamos.",
});

const hoy = [
  {
    icon: Users,
    titulo: "El taller es una organización",
    texto:
      "Creas la organización del curso, invitas a tus alumnos por correo y cada uno entra con su propia cuenta. Los papeles ya existen: propietario, administrador, miembro y observador, con los permisos decididos en el servidor. Un observador ve y comenta sin poder modificar el plano, que es exactamente lo que necesita un ayudante de cátedra.",
  },
  {
    icon: Share2,
    titulo: "Revisar sin descargar nada",
    texto:
      "Los alumnos entregan dentro de la organización y tú revisas en el navegador: enlaces de revisión con caducidad y revocación, y comentarios anclados a un punto concreto de la geometría. Se acabó el «te lo mando por correo y dime en qué muro».",
  },
  {
    icon: GraduationCap,
    titulo: "Nada que instalar en el laboratorio",
    texto:
      "Ni instalador, ni licencias por equipo, ni una máquina donde vive el programa. Cada alumno entra con su cuenta desde cualquier computadora del aula, de la biblioteca o de su casa y encuentra su trabajo donde lo dejó. Montar una clase de dibujo deja de empezar por administrar software.",
  },
] as const;

export default function EducacionPage() {
  return (
    <PublicPageShell
      eyebrow="Educación"
      title="Para escuelas y talleres de proyectos"
      intro="Un taller de dibujo puede usar Valle Design hoy con las mismas herramientas que un despacho: la organización del grupo, las invitaciones por correo y la revisión sobre el plano. Y estamos preparando un plan educativo gratuito por correo institucional."
    >
      <PublicSection title="Lo que ya funciona hoy">
        <div className="grid gap-5 sm:grid-cols-2">
          {hoy.map(({ icon: Icon, titulo, texto }) => (
            <Surface key={titulo} padded="sm" className="flex flex-col gap-3">
              <Icon aria-hidden="true" className="h-5 w-5 text-primary-ink" />
              <h3 className="type-heading">{titulo}</h3>
              <p className="type-small text-muted-foreground">{texto}</p>
            </Surface>
          ))}
        </div>
      </PublicSection>

      <PublicSection title="El plan educativo que estamos preparando">
        <p>
          Gratuito para alumnos y profesores, con acceso completo al editor y sin
          fecha de vencimiento mientras dure la vinculación con la institución.
          La activación sería por el correo institucional, aprovechando la
          verificación de correo que la cuenta ya exige de todas formas.
        </p>
        <p>
          <strong className="font-semibold text-foreground">
            Todavía no está abierto
          </strong>
          , y preferimos decirlo así en vez de poner un botón que lleve a un alta
          normal. Quedan dos decisiones que no son técnicas: qué dominios
          institucionales se aceptan y con qué capacidad de soporte se atiende el
          pico de altas del principio de un semestre. Cuando estén tomadas, esta
          página lo dirá y quien nos haya dejado su contacto recibirá aviso.
        </p>
        <Surface
          padded="sm"
          elevation="none"
          texture="corners"
          className="flex flex-col gap-4 border-primary/25 bg-primary/[.05] sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="type-heading">¿Das clase y te interesa?</p>
            <p className="type-small mt-2 text-muted-foreground">
              Cuéntanos la escuela, la materia y cuántos alumnos serían. Te
              avisamos en cuanto el plan abra, y tu respuesta nos ayuda a decidir
              por dónde empezar.
            </p>
          </div>
          {/*
            Va al canal de contacto y NO al centro de comentarios del producto,
            aunque ese centro exista y guarde con estado. La razón es que el
            centro exige sesión, y quien llega a esta página es justo quien
            todavía no tiene cuenta: un profesor evaluando si esto sirve para su
            taller. Pedirle que se registre para poder decir que le interesa
            invierte el orden de la conversación.

            Cuando el plan educativo se encienda, el interés recogido aquí y los
            comentarios del producto acabarán en el mismo sitio; hoy la vía que
            funciona sin cuenta es ésta, y es la que se ofrece.
          */}
          <Link
            href={COMMERCIAL_LINKS.contact}
            className={buttonClass({ variant: "primary" })}
          >
            Dejar mi contacto
          </Link>
        </Surface>
      </PublicSection>

      <PublicSection title="Lo que un alumno se lleva">
        <p>
          Sus planos. Se exportan a DXF —el formato estándar de intercambio— y a
          PDF cuando quiera, y eso no depende de que la cuenta siga activa: al
          terminar cualquier periodo, la sesión conserva el permiso de ver y
          exportar. Un trabajo de curso no se queda atrapado dentro de una
          herramienta el día que el curso acaba.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
