"use client";

import dynamic from "next/dynamic";

/**
 * `/revision` — la puerta del cliente final.
 *
 * ## Por qué la ruta NO lleva el token
 *
 * Sería `/revision/<token>` y sería un error. Un segmento de ruta viaja al
 * servidor en cada petición: quedaría en el log de acceso, en la cabecera
 * `Referer` de cualquier enlace externo que el cliente pinchara desde aquí y
 * en el historial de todo proxy por el que pasara. El token va en el
 * FRAGMENTO (`/revision#cadReview=…`), que no sale del navegador, y esta
 * página lo saca de la barra nada más leerlo
 * (`lib/cad/collab/review-token.ts`).
 *
 * Consecuencia buscada: esta ruta es ESTÁTICA e idéntica para todo el mundo.
 * El servidor no puede distinguir a un revisor de otro porque no recibe nada
 * con lo que distinguirlos.
 *
 * ## Por qué `ssr: false` y no sólo `dynamic`
 *
 * La primera pantalla depende del fragmento. Con SSR, el servidor pinta
 * «Abriendo la revisión…» y el navegador —que sí ve el fragmento— pinta otra
 * cosa en el mismo instante: React lo detecta como discrepancia de
 * hidratación, tira el árbol servido y vuelve a renderizar. Se veía en la
 * consola del golden. Sin SSR no hay dos verdades que reconciliar, y de paso
 * el visor no ocupa un solo ciclo de CPU del servidor.
 *
 * Los metadatos (`noindex`, título) viven en `layout.tsx`, que sí es de
 * servidor.
 */
const ReviewLinkClient = dynamic(
  () => import("@/components/cad/collab/ReviewLinkClient"),
  {
    ssr: false,
    loading: () => (
      <main className="grid min-h-dvh place-items-center bg-[#070b16] p-6">
        <p role="status" className="text-sm text-gray-400">
          Cargando el visor de revisión…
        </p>
      </main>
    ),
  },
);

export default function ReviewLinkPage() {
  return <ReviewLinkClient />;
}
