import Link from "next/link";
import { PRODUCT_LABEL } from "@/config/brand";
import { docGuidePath } from "@/config/site-routes";
import { dwgClaim } from "@/lib/marketing/dwg-claim";
import { TrademarkNotice } from "./TrademarkNotice";

/**
 * LA COMPARATIVA HONESTA.
 *
 * Una tabla y no una lista de tarjetas: el visitante que llega aquí viene de
 * un CAD de escritorio y quiere saber, fila por fila, qué cambia. Cada fila de
 * la columna del producto es VERIFICABLE en el código (el módulo va anotado
 * al lado) y la columna de la derecha describe la forma general de un CAD de
 * escritorio tradicional sin nombrar a ninguno: la decisión del dueño del
 * 2026-08-28 («que la página diga lo que hace, no contra quién compite») sigue
 * vigente y `check:surface` la hace cumplir en este archivo como en el resto.
 *
 * Lo que NO se hace aquí, a conciencia: ni marcas de verificación verdes
 * contra cruces rojas, ni insignias, ni una fila que el producto sólo cumpla a
 * medias sin decir la mitad que falta. Donde hay límite, va en la misma celda.
 *
 * La fila de DWG sale de `dwg-claim.ts`, la única fuente de esa verdad: dice
 * lo que abre ESTA build y nunca «escribe DWG».
 */

type Row = {
  readonly aspecto: string;
  readonly producto: React.ReactNode;
  readonly escritorio: string;
};

export function Comparison() {
  const dwg = dwgClaim();
  const rows: readonly Row[] = [
    {
      aspecto: "Instalación",
      producto: "Ninguna: abre en el navegador que ya tienes.",
      escritorio: "Instalador y licencia atados a una computadora.",
    },
    {
      aspecto: "Licencia",
      // `/precios` lo lee del catálogo; `FiscalSeal` deriva el CFDI del modo real.
      producto:
        "Suscripción mensual que se cancela desde el portal; conservas el acceso hasta el fin del periodo pagado.",
      escritorio: "Habitualmente anual y por puesto.",
    },
    {
      aspecto: "Moneda y factura",
      producto: "Pesos mexicanos con IVA incluido y comprobante CFDI.",
      escritorio: "Depende del distribuidor.",
    },
    {
      aspecto: "Dibujo 2D",
      // `lib/cad/engine/commands/*`, goldens 12/16/18 y `CapabilityExplorer`.
      producto:
        "Referencias a objetos, línea de comandos con los alias de siempre, capas, bloques con atributos, cotas asociativas, espacio papel y PDF a escala.",
      escritorio: "Sí.",
    },
    {
      aspecto: "Sólidos 3D",
      // ADR-0016: `lib/brep/` (extrude, boolean, fillet, shell), PRESSPULL.
      producto:
        "Modelado directo con kernel B-rep propio: extrusión, booleanas, redondeo. Facetado, sin NURBS y sin BIM.",
      escritorio: "Sí, según el producto.",
    },
    {
      aspecto: "DXF",
      // `lib/cad/dxf-export.ts` escribe AC1015; el manifiesto de pérdidas es parte del contrato.
      producto:
        "Lectura y escritura en AC1015 con manifiesto de pérdidas entidad por entidad.",
      escritorio: "Sí.",
    },
    {
      aspecto: "DWG",
      producto: (
        <>
          {dwg.short}{" "}
          <Link
            href={docGuidePath("dxf-vs-dwg")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Qué significa cada formato
          </Link>
        </>
      ),
      escritorio: "Formato nativo habitual.",
    },
    {
      aspecto: "Automatización",
      // `lib/lisp/`: lector, evaluador, DCL, en entorno aislado con presupuesto.
      producto:
        "Intérprete del dialecto LISP del dibujo técnico, con DCL, en un entorno aislado con presupuesto de pasos y de tiempo. Un subconjunto, declarado en la guía.",
      escritorio: "Según el producto.",
    },
    {
      aspecto: "Colaboración",
      // `components/cad/collab/*`: enlaces de revisión, comentarios anclados, conflicto al guardar.
      producto:
        "Asíncrona: enlaces de revisión que caducan, comentarios anclados a la geometría y resolución de conflictos al guardar. Sin cursores en vivo.",
      escritorio: "Archivo por archivo.",
    },
    {
      aspecto: "Trabajo sin conexión",
      producto:
        "No garantizado: pensado para trabajar conectado, con borradores de recuperación en el navegador durante siete días.",
      escritorio: "Sí.",
    },
    {
      aspecto: "Nubes de puntos y raster georreferenciado",
      producto: "No. Shapefile sí, con sus archivos acompañantes.",
      escritorio: "Según el producto.",
    },
  ];

  return (
    <div className="mt-12">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            Comparación entre {PRODUCT_LABEL.design} y un CAD de escritorio
            tradicional, aspecto por aspecto
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="type-micro py-3 pr-6 font-semibold text-muted-foreground">
                Aspecto
              </th>
              <th scope="col" className="type-micro py-3 pr-6 font-semibold text-foreground">
                {PRODUCT_LABEL.design}
              </th>
              <th scope="col" className="type-micro py-3 font-semibold text-muted-foreground">
                CAD de escritorio tradicional
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ aspecto, producto, escritorio }) => (
              <tr key={aspecto} className="border-b border-border align-top">
                <th scope="row" className="type-body py-5 pr-6 font-semibold">
                  {aspecto}
                </th>
                <td className="type-body py-5 pr-6 text-foreground">{producto}</td>
                <td className="type-body py-5 text-muted-foreground">{escritorio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TrademarkNotice className="type-small mt-6 max-w-2xl text-muted-foreground" />
    </div>
  );
}
