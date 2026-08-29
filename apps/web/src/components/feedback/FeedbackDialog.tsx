"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { designClient } from "@/lib/cad/repositories/client";
import { APP_VERSION } from "@/config/launch";
import { describeUserAgent } from "@/lib/user-agent";
import {
  Button,
  Checkbox,
  Modal,
  Textarea,
  buttonClass,
  cx,
} from "@/components/ui";

/**
 * EL CENTRO DE COMENTARIOS, DENTRO DEL PRODUCTO.
 *
 * ── POR QUÉ EXISTE, HABIENDO YA UN BOTÓN DE «ALGO SALIÓ MAL» ────────────────
 * Aquel botón sirve para un INCIDENTE: algo se rompió, alguien tiene que
 * mirarlo hoy, y su destino es un correo. Este canal es para lo otro — la
 * sugerencia que a alguien se le ocurre un martes dibujando, la duda que no
 * llegó a hacer, la falla pequeña que no justifica un incidente pero que se
 * repite. Ese material no cabe en un correo que se lee y se borra: hay que
 * guardarlo, y hay que devolverle al autor la señal de que alguien lo leyó.
 *
 * El dueño lo pidió con estas palabras: «un canal donde los usuarios reporten
 * fallas y sugerencias desde dentro del producto», y remató con la parte que se
 * suele olvidar: «que se sienta escuchado es el punto».
 *
 * ── LAS TRES DECISIONES DE INTERFAZ ─────────────────────────────────────────
 *
 * 1 · TRES CLASES Y NINGUNA MÁS. Falla, sugerencia, duda. Un desplegable con
 *     nueve categorías obliga a clasificar antes de escribir, que es
 *     exactamente el momento en que la gente cierra la ventana. Tres opciones
 *     se leen de un vistazo y se eligen sin pensar.
 *
 * 2 · EL CONTEXTO TÉCNICO ES OPCIONAL Y SE ENSEÑA ENTERO. La casilla viene
 *     desmarcada y debajo está la lista literal de lo que se enviaría. Un
 *     «adjuntar información de diagnóstico» que no dice qué adjunta es lo que
 *     hace que la gente marque que no por si acaso, y entonces el reporte llega
 *     sin nada útil. Aquí se ve que son cuatro datos y que el DIBUJO no está
 *     entre ellos.
 *
 * 3 · AL ENVIAR, SE DICE DÓNDE MIRAR. La confirmación enlaza a «mis
 *     comentarios». Un «gracias por tu comentario» que no lleva a ninguna parte
 *     es el final del canal; el enlace es lo que convierte un buzón en una
 *     conversación.
 */

const CLASES = [
  {
    kind: "falla" as const,
    titulo: "Algo no funciona",
    ayuda: "Se rompió, se comporta raro o no hace lo que dice.",
  },
  {
    kind: "sugerencia" as const,
    titulo: "Se me ocurre algo",
    ayuda: "Una idea, una mejora, algo que te ahorraría tiempo.",
  },
  {
    kind: "duda" as const,
    titulo: "Tengo una duda",
    ayuda: "No encuentras cómo hacer algo, o no sabes si se puede.",
  },
] as const;

export function FeedbackDialog({
  open,
  onClose,
  documentId,
  claseInicial,
  mensajeInicial,
}: {
  open: boolean;
  onClose: () => void;
  /** Sólo en el estudio. Viaja únicamente si se marca la casilla. */
  documentId?: string | null;
  /**
   * Con qué clase abre el diálogo. Lo usa la frontera de error: cuando un panel
   * se cae, la clase ya se sabe —es una falla— y preguntarla otra vez es hacerle
   * al usuario el trabajo del programa.
   */
  claseInicial?: (typeof CLASES)[number]["kind"];
  /**
   * Texto con el que abre el cuadro de mensaje. Precargado, no fijo: el usuario
   * puede borrarlo entero. Existe porque un reporte de fallo llega vacío o no
   * llega, y lo que hace falta —qué panel, qué error, qué digest— lo sabe el
   * programa y no la persona.
   */
  mensajeInicial?: string;
}) {
  const [kind, setKind] =
    useState<(typeof CLASES)[number]["kind"]>(claseInicial ?? "sugerencia");
  const [mensaje, setMensaje] = useState(mensajeInicial ?? "");
  const [conContexto, setConContexto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Lo que se enviaría. Se calcula SIEMPRE —esté marcada la casilla o no—
   * porque hay que poder enseñarlo antes de que el usuario decida. Sólo se
   * adjunta si la marca.
   */
  const contexto =
    typeof window === "undefined"
      ? {}
      : {
          ruta: window.location.pathname,
          navegador: describeUserAgent(window.navigator.userAgent),
          version: APP_VERSION,
          ventana: `${window.innerWidth}×${window.innerHeight}`,
          ...(documentId ? { documentoId: documentId } : {}),
        };

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await designClient.feedback.create({
        kind,
        message: mensaje,
        ...(conContexto ? { context: contexto } : {}),
      });
      setEnviado(true);
      setMensaje("");
      setConContexto(false);
    } catch {
      setError(
        "No se pudo enviar. Revisa tu conexión y vuelve a intentarlo; tu texto sigue aquí.",
      );
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    setEnviado(false);
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Cuéntanos"
      data-testid="feedback-dialog"
    >
      {enviado ? (
        <div className="space-y-5">
          <p className="type-body text-foreground">
            Recibido. Lo leemos todo — somos pocos y cada comentario llega a una
            persona, no a un buzón automático.
          </p>
          <p className="type-small text-muted-foreground">
            Puedes seguir su estado en tu lista de comentarios: cuando alguien
            lo lea, lo planee o lo cierre, lo verás ahí.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/comentarios"
              className={buttonClass({ variant: "primary" })}
            >
              Ver mis comentarios
            </Link>
            <Button variant="secondary" onClick={cerrar}>
              Seguir dibujando
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-6">
          <fieldset>
            <legend className="type-small font-medium text-foreground">
              ¿De qué se trata?
            </legend>
            <div className="mt-3 grid gap-2">
              {CLASES.map((clase) => (
                <label
                  key={clase.kind}
                  className={cx(
                    "motion-fast flex cursor-pointer gap-3 rounded-control border p-3 transition-[background-color,border-color]",
                    kind === clase.kind
                      ? "border-brand-strong bg-primary/10"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={clase.kind}
                    checked={kind === clase.kind}
                    onChange={() => setKind(clase.kind)}
                    className="mt-1 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className="block type-small font-medium text-foreground">
                      {clase.titulo}
                    </span>
                    <span className="block type-caption text-muted-foreground">
                      {clase.ayuda}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Textarea
            label="Cuéntanos con tus palabras"
            name="message"
            value={mensaje}
            onChange={(event) => setMensaje(event.target.value)}
            rows={5}
            minLength={10}
            maxLength={4000}
            required
            hint="Mientras más concreto, mejor: qué esperabas y qué pasó."
          />

          <div className="rounded-card border border-border bg-muted/40 p-4">
            <Checkbox
              label="Adjuntar información técnica"
              checked={conContexto}
              onChange={(event) => setConContexto(event.target.checked)}
            />
            {/*
              La lista literal de lo que se enviaría, siempre visible. Un
              «adjuntar diagnóstico» que no dice qué adjunta es lo que hace que
              la gente lo desmarque por si acaso — y entonces el reporte llega
              sin nada con lo que trabajar.
            */}
            <ul className="mt-3 space-y-1 type-caption text-muted-foreground">
              {Object.entries(contexto).map(([campo, valor]) => (
                <li key={campo} className="type-mono truncate">
                  {campo}: {String(valor)}
                </li>
              ))}
            </ul>
            <p className="type-caption mt-3 text-muted-foreground">
              <strong className="font-semibold text-foreground">
                Tu dibujo no viaja nunca
              </strong>
              , ni marcando esta casilla. Sólo el identificador del documento,
              para poder mirar su historial si hace falta.
            </p>
          </div>

          {error ? (
            <p role="alert" className="type-small text-danger-ink">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={enviando}>
              Enviar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * El botón que lo abre. Vive en el panel y en el estudio.
 *
 * NO es flotante sobre el lienzo. La lección quedó escrita cuando el aviso de
 * tableta capturaba clics: en un editor de dibujo, cualquier cosa que se ponga
 * encima del área de trabajo acaba robando un punto que el usuario quería
 * designar. Va en el cromo, donde estorba a nadie.
 */
export function FeedbackButton({
  documentId,
  className,
  etiqueta = "Comentarios",
  claseInicial,
  mensajeInicial,
  variant = "ghost",
}: {
  documentId?: string | null;
  className?: string;
  /** El texto del botón. La frontera de error lo cambia a «Reportar el fallo». */
  etiqueta?: string;
  claseInicial?: "falla" | "sugerencia" | "duda";
  mensajeInicial?: string;
  variant?: "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={className}
        data-testid="feedback-open"
        onClick={() => setOpen(true)}
        iconLeft={<MessageSquarePlus aria-hidden="true" className="h-4 w-4" />}
      >
        {etiqueta}
      </Button>
      {/*
        `key` atada a `open`: al abrir, el diálogo se REMONTA y su estado vuelve
        a nacer de las props. Es lo que hace que la precarga funcione la segunda
        vez y la tercera —la frontera de error manda un mensaje distinto en cada
        caída— sin un efecto que sincronice props con estado. Un `useEffect` que
        llama a `setState` haría exactamente esto, con un render de más y con el
        aviso que el trinquete de lint del repo lleva bajando desde hace
        campañas.
      */}
      <FeedbackDialog
        key={open ? "abierto" : "cerrado"}
        open={open}
        onClose={() => setOpen(false)}
        documentId={documentId}
        claseInicial={claseInicial}
        mensajeInicial={mensajeInicial}
      />
    </>
  );
}
