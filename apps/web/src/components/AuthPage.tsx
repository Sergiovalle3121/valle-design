import Link from "next/link";
import { DraftingCompass } from "lucide-react";
import { PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_LINKS } from "@/config/commercial";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section aria-labelledby="auth-title" className="w-full max-w-md rounded-3xl border border-black/10 bg-white/70 p-6 shadow-xl shadow-indigo-500/5 dark:border-white/10 dark:bg-white/5 sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold"><DraftingCompass aria-hidden="true" className="h-6 w-6 text-cyan-500" />{PRODUCT_LABEL.design}</Link>
        <h1 id="auth-title" className="mt-8 text-3xl font-bold">{register ? "Crea tu cuenta" : "Te damos la bienvenida"}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">{register ? "Empieza a preparar entregables técnicos con un flujo verificable." : "Accede a tus dibujos, revisiones y entregables."}</p>
        <form className="mt-8 space-y-5">
          {register && <div><label htmlFor="name" className="mb-2 block text-sm font-medium">Nombre</label><input id="name" name="name" autoComplete="name" required className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20" /></div>}
          <div><label htmlFor="email" className="mb-2 block text-sm font-medium">Correo electrónico</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20" /></div>
          <div><label htmlFor="password" className="mb-2 block text-sm font-medium">Contraseña</label><input id="password" name="password" type="password" minLength={8} autoComplete={register ? "new-password" : "current-password"} required className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20" /></div>
          <button type="submit" className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500">{register ? "Crear cuenta" : "Iniciar sesión"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">{register ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"} <Link className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-300" href={register ? "/login" : "/register"}>{register ? "Inicia sesión" : "Regístrate"}</Link></p>
        <p className="mt-5 text-center text-xs text-gray-500">¿Necesitas ayuda? <a className="underline" href={COMMERCIAL_LINKS.support}>Contacta con soporte</a>.</p>
      </section>
    </main>
  );
}
