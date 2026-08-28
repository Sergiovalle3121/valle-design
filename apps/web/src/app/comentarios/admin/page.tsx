import type { Metadata } from "next";
import { FeedbackAdmin } from "./FeedbackAdmin";

export const metadata: Metadata = {
  title: "Comentarios del producto",
  robots: { index: false, follow: false },
};

export default function ComentariosAdminPage() {
  return <FeedbackAdmin />;
}
