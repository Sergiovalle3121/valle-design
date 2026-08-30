import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoStudio } from "./DemoStudio";
import { demoIsVisible } from "@/config/launch";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

/**
 * /demo — DIBUJA ANTES DE REGISTRARTE.
 *
 * Nada vende un CAD como dibujar en él a los diez segundos de llegar. Un CAD
 * de escritorio no puede ofrecer esto; uno que corre en el navegador, sí: el
 * editor REAL (mismo bundle, mismos comandos, mismo trazador a PDF) con un
 * plano de casa habitación precargado y el guardado apuntando al navegador
 * del visitante. El veredicto del spike y sus límites están en la bitácora
 * de campaña (CAMPANA_SITIO_20260829, OLA 2).
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/demo",
  title: "Demostración: dibuja sin crear cuenta",
  description:
    "Abre el editor CAD real en tu navegador y dibuja sobre un plano de casa " +
    "habitación: línea de comandos, capas, cotas y PDF a escala. Sin registro.",
});

export default function DemoPage() {
  // Interruptor de operación (NEXT_PUBLIC_DEMO_MODE=off): si la demo está
  // apagada, la ruta no existe — fix-or-hide, nunca una página a medias.
  if (!demoIsVisible()) notFound();
  return <DemoStudio />;
}
