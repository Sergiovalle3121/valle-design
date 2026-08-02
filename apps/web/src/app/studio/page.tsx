import { redirect } from "next/navigation";

/** `/studio` ya no abre ni crea el documento sentinel. */
export default function StudioIndex(): never {
  redirect("/dashboard");
}
