"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { setUserLocale } from "@/i18n/locale";
import {
  locales,
  localeShortLabels,
  localeLabels,
  type Locale,
} from "@/i18n/config";

/**
 * Switch de idioma EN/ES. Persiste la elección en cookie vía Server Action
 * (`setUserLocale`) y refresca la ruta para que el SSR re-renderice con el nuevo
 * idioma — sin recarga completa ni flash, respetando SSR.
 *
 * Variantes:
 * - "segmented" (default): control segmentado EN | ES. Para landing/login.
 * - "compact": segmentado más pequeño, para el header del dashboard.
 */
export function LanguageSwitcher({
  variant = "segmented",
  className = "",
}: {
  variant?: "segmented" | "compact";
  className?: string;
}) {
  const router = useRouter();
  const activeLocale = useLocale() as Locale;
  const t = useTranslations("language");
  const [isPending, startTransition] = useTransition();

  const change = (locale: Locale) => {
    if (locale === activeLocale || isPending) return;
    startTransition(async () => {
      await setUserLocale(locale);
      router.refresh();
    });
  };

  const compact = variant === "compact";

  return (
    <div
      role="group"
      aria-label={t("switchTo")}
      className={[
        "inline-flex items-center rounded-full border border-black/10 dark:border-white/15",
        "bg-white/60 dark:bg-white/5 backdrop-blur",
        compact ? "p-0.5 text-[11px]" : "p-1 text-xs",
        className,
      ].join(" ")}
    >
      <Languages
        aria-hidden
        className={compact ? "ml-1 mr-0.5 h-3 w-3 opacity-60" : "ml-1.5 mr-1 h-3.5 w-3.5 opacity-60"}
      />
      {locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => change(locale)}
            aria-pressed={isActive}
            aria-label={localeLabels[locale]}
            disabled={isPending}
            className={[
              "rounded-full font-medium transition-colors",
              compact ? "px-2 py-0.5" : "px-2.5 py-1",
              isActive
                ? "bg-[var(--brand-primary-strong,#4f46e5)] text-white shadow-sm"
                : "text-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10",
              isPending ? "opacity-70" : "",
            ].join(" ")}
          >
            {localeShortLabels[locale]}
          </button>
        );
      })}
    </div>
  );
}
