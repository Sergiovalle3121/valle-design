"use client";

import Image from "next/image";
import { useRef } from "react";
import { FilePlus2, PlayCircle, Upload } from "lucide-react";
import { Button, Surface, cx } from "@/components/ui";

/**
 * EL PRIMER MINUTO.
 *
 * Lo que había al llegar al tablero vacío: una caja de borde punteado con una
 * frase gris — «Aún no hay proyectos ni documentos. Crea tu primer proyecto
 * para comenzar.» — y, arriba, dos formularios con seis campos entre los dos.
 * Es decir: quien acaba de recorrer siete pasos para llegar aquí se encuentra
 * con deberes, no con un producto.
 *
 * Tres caminos, y el primero es el que decide la venta:
 *
 *   1. ABRIR UN PLANO DE EJEMPLO. En cinco segundos el usuario está mirando un
 *      dibujo terminado —muros que resuelven su esquina, cotas amarradas,
 *      cajetín— dentro del editor. Es la diferencia entre «parece que funciona»
 *      y «lo vi funcionando». Y es LITERALMENTE el plano de la portada: quien
 *      llegó por la captura del hero abre exactamente lo que vio.
 *   2. CREAR UN PLANO EN BLANCO con las plantillas mexicanas de arranque, que
 *      existían y estaban escondidas dentro de un formulario.
 *   3. IMPORTAR UN DXF, que es como llega quien ya tiene trabajo hecho.
 *
 * La vista previa NO es una ilustración: es la captura real del producto que
 * genera `npm run capture:product`. Si el editor cambiara, cambia ella.
 */
export function FirstMinute({
  canEdit,
  busy,
  onOpenSample,
  onCreateBlank,
  onImport,
  className,
}: {
  canEdit: boolean;
  busy: boolean;
  onOpenSample: () => void;
  onCreateBlank: () => void;
  onImport: (files: FileList | null) => void;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!canEdit) {
    return (
      <Surface
        padded="lg"
        className={cx("mt-10 text-center", className)}
        data-testid="dashboard-empty"
      >
        <h2 className="type-heading">Este espacio todavía está vacío</h2>
        <p className="type-small mx-auto mt-3 max-w-md text-muted-foreground">
          Tu rol permite consultar proyectos y documentos. Cuando alguien de tu
          organización cree el primero, aparecerá aquí.
        </p>
      </Surface>
    );
  }

  return (
    <section
      aria-labelledby="primer-minuto"
      className={cx("mt-10", className)}
      data-testid="dashboard-empty"
    >
      <h2 id="primer-minuto" className="type-title">
        Empecemos por ver un plano
      </h2>
      <p className="type-lead mt-3 max-w-2xl text-muted-foreground">
        No hace falta configurar nada para probar el editor. Abre el ejemplo,
        muévelo, mide, y cuando quieras empieza el tuyo.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* ── El camino que decide la venta ────────────────────────────── */}
        <Surface
          elevation="elevated"
          padded={false}
          className="flex flex-col overflow-hidden border-brand-strong/40"
        >
          <div className="relative border-b border-border bg-muted/40">
            <Image
              src="/product/estudio-dark.png"
              alt="Planta arquitectónica acotada, abierta en el editor"
              width={2880}
              height={1800}
              sizes="(min-width: 1024px) 40rem, 100vw"
              className="block h-auto w-full"
            />
          </div>
          <div className="flex flex-1 flex-col p-6">
            <h3 className="type-heading">Abre un plano de ejemplo</h3>
            <p className="type-small mt-2 text-muted-foreground">
              Una planta con muros que resuelven su esquina, cotas amarradas a la
              geometría y su cajetín. Es tuyo: dibuja encima, bórralo o
              impórtalo a PDF.
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              loading={busy}
              onClick={onOpenSample}
              data-testid="first-minute-sample"
              iconLeft={<PlayCircle className="h-5 w-5" />}
            >
              Abrir el plano de ejemplo
            </Button>
          </div>
        </Surface>

        {/* ── Los otros dos ─────────────────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <PathCard
            Icon={FilePlus2}
            title="Crea un plano en blanco"
            text="Con las plantillas mexicanas de arranque: capas, estilo de cota, escala y cajetín ya puestos."
            action={
              <Button
                variant="secondary"
                fullWidth
                onClick={onCreateBlank}
                disabled={busy}
                data-testid="first-minute-blank"
              >
                Elegir plantilla
              </Button>
            }
          />
          <PathCard
            Icon={Upload}
            title="Importa un DXF"
            text="Con comprobación previa y un manifiesto que dice, entidad por entidad, qué no viajó igual."
            action={
              <>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  data-testid="first-minute-import"
                >
                  Elegir archivo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="sr-only"
                  accept=".dxf,.json,.shp,.shx,.dbf,.prj,.cpg"
                  multiple
                  onChange={(event) => {
                    onImport(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </>
            }
          />
        </div>
      </div>
    </section>
  );
}

function PathCard({
  Icon,
  title,
  text,
  action,
}: {
  Icon: typeof FilePlus2;
  title: string;
  text: string;
  action: React.ReactNode;
}) {
  return (
    <Surface className={cx("flex h-full flex-col")}>
      <Icon aria-hidden="true" className="h-6 w-6 text-primary-ink" />
      <h3 className="type-heading mt-4">{title}</h3>
      <p className="type-small mt-2 text-muted-foreground">{text}</p>
      <div className="mt-auto pt-5">{action}</div>
    </Surface>
  );
}
