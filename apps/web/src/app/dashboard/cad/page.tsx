'use client';

import dynamic from 'next/dynamic';
import type React from 'react';
import Link from 'next/link';
import { ChevronLeft, DraftingCompass, Layers3, Ruler, Sparkles } from 'lucide-react';
import { glass } from '@/lib/glass';
import { PRODUCT_LABEL } from "@/config/brand";

// Host = adaptador enterprise: inyecta contextos (auth/workspace/tema/toast),
// chrome y marca al editor CAD agnóstico de plataforma (WP5).
const Layout3DEditorHost = dynamic(
  () => import('@/components/line-engineering/Layout3DEditorHost'),
  { ssr: false },
);

const UNIVERSAL_CAD_MODEL = 'AXOS-CAD-STUDIO';
const UNIVERSAL_CAD_REVISION = 'UNIVERSAL';

export default function CadStudioPage() {
  return (
    <div className="min-h-screen text-foreground">
      <div className={`${glass} sticky top-0 z-40 px-6 py-4`}>
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href="/dashboard" aria-label="Volver al inicio" className="-ml-2 rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-500">
            <DraftingCompass className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight">{PRODUCT_LABEL.design}</h1>
            <p className="text-[12px] leading-tight text-gray-500 dark:text-gray-400">
              CAD universal 2D/3D para arquitectura, ingeniería, almacenes, plantas, obra civil y layouts técnicos — separado del balanceo EMS.
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Badge icon={Ruler} label="Precisión" />
            <Badge icon={Layers3} label="Capas + DXF" />
            <Badge icon={Sparkles} label="Copiloto" />
          </div>
        </div>
      </div>

      <Layout3DEditorHost
        model={UNIVERSAL_CAD_MODEL}
        revision={UNIVERSAL_CAD_REVISION}
        models={[{ model: UNIVERSAL_CAD_MODEL, revision: UNIVERSAL_CAD_REVISION }]}
        open
        standalone
        title={PRODUCT_LABEL.design}
        subtitle="Modo universal: arquitectura, ingeniería, obra civil, almacenes y plantas; no depende de balanceo de línea."
        onClose={() => { window.location.href = '/dashboard'; }}
      />
    </div>
  );
}

function Badge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/70 px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm dark:bg-white/5 dark:text-gray-300">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}
