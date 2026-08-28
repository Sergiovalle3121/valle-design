import type { Metadata } from "next";
import { FeedbackInbox } from "./FeedbackInbox";

export const metadata: Metadata = {
  title: "Mis comentarios",
  robots: { index: false, follow: false },
};

export default function ComentariosPage() {
  return <FeedbackInbox />;
}
