import type { Metadata } from "next";

/**
 * Metadatos del segmento `/revision`.
 *
 * Viven en el layout y no en la página porque la página es un componente de
 * CLIENTE: todo lo que hace depende del fragmento de la URL, que el servidor
 * no recibe. Un layout de servidor es el sitio que el App Router deja para
 * declarar metadatos de un segmento cuyo cuerpo se renderiza sólo en el
 * navegador.
 *
 * `noindex`: no hay nada que indexar —sin fragmento esta URL es una pantalla
 * de «falta la credencial»— y sí un motivo para no salir en buscadores: que
 * nadie llegue aquí buscando «revisar plano» y crea que el producto se le ha
 * roto.
 */
export const metadata: Metadata = {
  title: "Revisión de plano",
  robots: { index: false, follow: false },
};

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
