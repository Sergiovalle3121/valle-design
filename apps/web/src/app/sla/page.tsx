import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { SlaPage } from "./SlaPage";

export const metadata: Metadata = publicPageMetadata({
  path: "/sla",
  title: "Niveles de servicio",
  description:
    "Compromisos de disponibilidad, respaldo y respuesta por plan, con los nombres del catálogo real.",
});

export default function Page() {
  return <SlaPage />;
}
