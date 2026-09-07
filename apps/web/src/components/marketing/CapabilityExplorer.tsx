"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Blocks,
  CloudUpload,
  Cuboid,
  DraftingCompass,
  Printer,
  Ruler,
} from "lucide-react";
import { PlanRender } from "@/components/gallery/PlanRender";
import { ProductFrame } from "./ProductFrame";
import { Badge, Surface, Tabs, TabPanel, cx } from "@/components/ui";
import type { GalleryTemplate } from "@/lib/marketing/template-gallery";

/**
 * EL EXPLORADOR DE CAPACIDADES POR PESTAÑAS.
 *
 * ── QUÉ SUSTITUYE Y POR QUÉ ───────────────────────────────────────────────────
 * La sección «Capacidades» era una retícula de siete tarjetas de texto: un
 * formato correcto para leer y malo para EXPLORAR — quien busca «¿y en 3D?» o
 * «¿y para automatizar?» tiene que escanear las siete antes de saber si su
 * pregunta está contestada. Autodesk organiza su comparador de funciones por
 * pestañas por la misma razón: la pregunta de un visitante casi siempre viene
 * con una disciplina puesta (dibujo, cotas, entrega, 3D…), así que la interfaz
 * debería dejarle saltar directo ahí.
 *
 * ── EL CONTENIDO SIGUE SIENDO EL MISMO, REAGRUPADO ───────────────────────────
 * Ninguna frase de aquí es nueva marketing: es la MISMA prosa vetada que tenía
 * la retícula de tarjetas (capas, bloques, DXF, LISP, proyectos en la nube),
 * repartida por disciplina en vez de por icono. La única pestaña con copy
 * nuevo es «3D», porque hasta esta campaña la portada no mencionaba el
 * modelado directo — es una capacidad real, con comando conectado
 * (`solids-push-face.ts`, grupo de ribbon «Sólidos») y su límite escrito al
 * lado (ADR-0016: kernel facetado, sin NURBS, sin BIM), exactamente con el
 * mismo criterio que las demás fichas de esta página.
 *
 * ── LOS ACTIVOS SON REALES, NO NUEVOS ─────────────────────────────────────────
 * Dibujo, Anotación y Entrega reutilizan capturas de `public/product/` que ya
 * existían y no aparecían en ningún otro lugar de la portada (se verificó cada
 * una pixel a pixel antes de escribir su pie, para no describir algo que la
 * captura no enseña). Toolsets reutiliza `PlanRender`: el mismo SVG que dibuja
 * el motor real para el catálogo de plantillas, aquí con tres plantillas por
 * disciplina en vez de por giro comercial. 3D y Colaboración no tienen captura
 * real disponible todavía —nadie ha fotografiado el editor en esos dos modos—
 * así que en vez de fingir una, llevan una demostración construida con las
 * mismas primitivas y tokens del sistema: un diagrama SVG del sólido facetado
 * y una maqueta de la paleta de versiones, ninguna de las dos pretende ser una
 * captura de pantalla.
 *
 * ── ACCESIBILIDAD ─────────────────────────────────────────────────────────────
 * La lista de pestañas es el `Tabs` del sistema, sin modificarlo: `tablist`
 * con `aria-label`, flechas para moverse entre pestañas, Inicio/Fin a los
 * extremos y Tab para SALIR de la lista hacia el panel — el patrón de teclado
 * vive en esa primitiva, no aquí. Este componente no reimplementa ni un solo
 * `onKeyDown`; hereda el comportamiento y hereda también su contrato de
 * pruebas: `CapabilityExplorer.spec.ts` comprueba el marcado ARIA estático
 * (tablist, aria-selected, tabindex, aria-controls) con el mismo método que
 * `primitives-contract.spec.ts` usa para `Tabs`. Lo que un navegador vivo
 * probaría —las flechas moviendo el foco de verdad— no tiene hoy un e2e propio
 * para `Tabs` en este repositorio; se deja dicho aquí en vez de fingir una
 * cobertura que no existe.
 *
 * El panel activo entra con `.draw-fade-in`, la animación que ya existe en
 * `globals.css` para «lo que aparece cuando toca» — no es un tercer mecanismo
 * de movimiento, y `prefers-reduced-motion` ya la neutraliza en la regla
 * global (la deja terminada, con opacidad 1, no en blanco).
 */

type CapabilityTabId =
  "dibujo" | "anotacion" | "entrega" | "3d" | "toolsets" | "colaboracion";

interface CapabilityTabDef {
  id: CapabilityTabId;
  numero: string;
  tabLabel: string;
  icon: typeof DraftingCompass;
  eyebrow: string;
  title: string;
  bullets: readonly string[];
  limite: string | null;
}

const CAPABILITY_TABS: readonly CapabilityTabDef[] = [
  {
    id: "dibujo",
    numero: "01",
    tabLabel: "Dibujo",
    icon: DraftingCompass,
    eyebrow: "Precisión de trazo",
    title: "Dibujo 2D con la precisión que exige un plano",
    bullets: [
      "Líneas, polilíneas con arcos, círculos, arcos, rectángulos, polígonos, elipses y splines.",
      "Referencias a objetos indexadas, rastreo polar, entrada por coordenadas y línea de comandos con la tabla de alias de siempre: escribes L, C o TR y responde.",
      "Gestor de capas con color, tipo de línea y grosor; sombreado asociativo al contorno; texto de párrafo con maquetación real.",
      "Muros que resuelven su unión en L, en T y en continuación colineal al dibujarlos.",
    ],
    limite:
      "El sombreado resuelve contornos poligonales: las islas anidadas y los contornos curvos siguen pendientes.",
  },
  {
    id: "anotacion",
    numero: "02",
    tabLabel: "Anotación",
    icon: Ruler,
    eyebrow: "Cotas que no mienten",
    title: "Cotas asociativas y anotación",
    bullets: [
      "Cota lineal, alineada, angular, de radio y de diámetro, con estilos de cota aplicables al plano entregado.",
      "La cota queda amarrada a la geometría que mide: mueves el muro y el número cambia solo.",
      "La paleta de propiedades edita cualquier objeto seleccionado —una cota incluida— por número, sin salir del inspector.",
    ],
    limite: null,
  },
  {
    id: "entrega",
    numero: "03",
    tabLabel: "Entrega",
    icon: Printer,
    eyebrow: "Del plano al PDF",
    title: "Espacio papel, impresión a escala y DXF de ida y vuelta",
    bullets: [
      "Presentaciones con varias ventanas, cada una a su escala, con capas congeladas por ventana.",
      "Papeles A4 a A0, carta y tabloide; escalas normalizadas de 1:1 a 1:5000; tablas de plumas CTB y STB que deciden color y grosor de cada trazo.",
      "La lámina sale a PDF con el tamaño de página exacto, cajetín y escala gráfica.",
      "DXF de texto —el formato estándar que cualquier programa de dibujo abre— importado y exportado con un manifiesto de pérdidas que dice, entidad por entidad, qué no viajó igual.",
    ],
    limite:
      "El emisor deja escrito qué fuentes incrustó y cuáles sustituyó por una estándar, sin medición de fidelidad tipográfica todavía. El DXF se escribe en versión AC1015 y sólo geometría plana —la Z se aplana—, con hasta 12 MB y 50 000 entidades por archivo; el corpus de ida y vuelta es propio, aún no de terceros con licencia para publicar una matriz de interoperabilidad.",
  },
  {
    id: "3d",
    numero: "04",
    tabLabel: "3D",
    icon: Cuboid,
    eyebrow: "Modelado directo",
    title: "Un sólido y su cota, en el mismo documento",
    bullets: [
      "PRESSPULL empuja o hunde una cara del sólido: el gesto entra al documento como un paso del historial, no como malla horneada, así que si el empujón salió mal cambias el número en propiedades en vez de deshacer todo lo de encima.",
      "El kernel es un B-rep de medias-aristas facetado (ADR-0016): los sólidos se combinan, cortan y editan cara por cara desde la misma barra de comandos.",
      "Aplica hoy a objetos sólidos; el muro y el vano siguen siendo paramétricos aparte, porque un muro que olvida su espesor rompe el corte y el cajetín.",
    ],
    limite:
      "Es facetado, no exacto: un cilindro es un prisma de N lados, y una cara curva verdadera —NURBS analítico— todavía no existe. Modelar volúmenes tampoco es BIM: no hay IFC, disciplinas cruzadas ni detección de interferencias.",
  },
  {
    id: "toolsets",
    numero: "05",
    tabLabel: "Toolsets",
    icon: Blocks,
    eyebrow: "Por disciplina",
    title: "Plantillas, bloques y automatización por disciplina",
    bullets: [
      "Biblioteca de bloques con atributos, compartida por organización.",
      "Arranques mexicanos dibujados por el motor —civil, estructura, instalaciones y más de un giro comercial— cada uno con sus capas de norma, su escala puesta y su cajetín con responsiva.",
      "Un intérprete del dialecto LISP del dibujo técnico —lector, evaluador, funciones de entidad por códigos DXF, conjuntos de selección y diálogos DCL— ejecutándose en un entorno aislado con presupuesto de pasos y de tiempo.",
    ],
    limite:
      "Sin bloques dinámicos ni comportamiento anotativo todavía. El LISP es un subconjunto del lenguaje —una rutina que dependa de funciones fuera de esa superficie necesita adaptarse— y tus rutinas se guardan en el navegador, no en el servidor: hoy no viajan solas a otra computadora.",
  },
  {
    id: "colaboracion",
    numero: "06",
    tabLabel: "Colaboración",
    icon: CloudUpload,
    eyebrow: "Con red debajo",
    title: "Proyectos en la nube, con red debajo",
    bullets: [
      "Los documentos viven en el servidor, aislados por organización, con guardado explícito y autoguardado sobre la misma cola de escritura.",
      "Versiones consultables y comparación entre ellas.",
      "Para revisar: enlaces con caducidad y revocación, y comentarios anclados a la geometría.",
    ],
    limite:
      "La revisión es asíncrona: dos personas comentan y se turnan sobre el documento, no dibujan a la vez con cursores simultáneos. Los borradores de recuperación se guardan en tu navegador durante siete días, no en el servidor.",
  },
] as const;

/**
 * Las tres plantillas por disciplina de la pestaña Toolsets, tomadas del MISMO
 * catálogo que sirve `/plantillas` y `FeaturedTemplates` — no son ids nuevos,
 * son las tres plantillas técnicas (civil, estructura, instalaciones) que la
 * portada, hasta hoy, no enseñaba nunca.
 */
function DibujoVisual() {
  return (
    <ProductFrame
      src="/product/paleta-propiedades.png"
      alt="La paleta de propiedades de Valle Design con un muro seleccionado"
      caption="Cada muro expone su geometría exacta —arranque, fin, espesor— y se edita por número, no a ojo."
      float={false}
    />
  );
}

function AnotacionVisual() {
  return (
    <ProductFrame
      src="/product/linea-de-comandos.png"
      alt="La línea de comandos de Valle Design a media ejecución del comando DLI"
      caption="El alias de siempre: escribes DLI (cota lineal) y el editor pide el origen de la línea de referencia. La cota nace del comando, no de un menú."
      float={false}
    />
  );
}

function EntregaVisual() {
  return (
    <ProductFrame
      src="/product/espacio-papel.png"
      alt="Espacio papel con la lámina y su cajetín"
      caption="El espacio papel con su cajetín: eliges tamaño de hoja y escala, y la lámina sale a PDF con el tamaño de página exacto."
      float={false}
    />
  );
}

/**
 * DIAGRAMA DEL SÓLIDO FACETADO — no es una captura, y no finge serlo.
 *
 * Sin barra de ventana ni puntos de semáforo: ese marco lo lleva `ProductFrame`
 * y significa «esto es una captura real». Aquí el mismo lenguaje visual —trazo
 * en `currentColor`, retícula del sistema— dibuja un prisma de ocho caras
 * (no un cilindro: el kernel es facetado) con una cara resaltada y una flecha
 * de PRESSPULL, que es exactamente el límite y el gesto que el texto describe.
 */
function SolidFacetDiagram() {
  return (
    <figure
      className="overflow-hidden rounded-card border border-border bg-background shadow-resting"
      data-testid="capability-visual-3d"
    >
      <svg
        viewBox="0 0 480 320"
        fill="none"
        aria-hidden="true"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block h-auto w-full"
      >
        <g
          className="text-border"
          stroke="currentColor"
          strokeWidth={0.5}
          opacity={0.5}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <path key={`h${i}`} d={`M0 ${(i + 1) * 32}H480`} />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <path key={`v${i}`} d={`M${(i + 1) * 32} 0V320`} />
          ))}
        </g>

        {/* El prisma de 8 lados: el "cilindro" que el kernel facetado sí sabe hacer. */}
        <g className="text-foreground" stroke="currentColor" strokeWidth={2}>
          <path d="M170 236 L150 200 L170 164 L210 150 L250 164 L270 200 L250 236 L210 250 Z" />
          <path
            d="M170 236 L150 200 L170 164 L210 150 L250 164 L270 200 L250 236 L210 250 Z"
            transform="translate(0,-64)"
          />
          <path d="M170 172 L170 236 M150 136 L150 200 M270 136 L270 200 M210 122 L210 186 M250 136 L250 200 M170 100 L170 164 M250 100 L250 164" />
        </g>

        {/* La cara superior, resaltada: la que PRESSPULL va a empujar. */}
        <path
          d="M170 172 L150 136 L170 100 L210 86 L250 100 L270 136 L250 172 L210 186 Z"
          className="fill-primary/15 text-primary-ink"
          stroke="currentColor"
          strokeWidth={2}
        />

        {/* La flecha del empujón, con su rótulo. */}
        <g className="text-primary-ink" stroke="currentColor" strokeWidth={2}>
          <path d="M210 136 V72" />
          <path d="M198 84 L210 68 L222 84" fill="none" />
        </g>
        <text
          x="210"
          y="52"
          textAnchor="middle"
          fontSize="13"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          className="fill-foreground"
        >
          PRESSPULL 300
        </text>
        <text
          x="360"
          y="200"
          textAnchor="middle"
          fontSize="12"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          className="fill-muted-foreground"
        >
          8 caras, no una
        </text>
        <text
          x="360"
          y="218"
          textAnchor="middle"
          fontSize="12"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          className="fill-muted-foreground"
        >
          curva verdadera
        </text>
      </svg>
      <figcaption className="type-small border-t border-border px-4 py-3 text-muted-foreground">
        Diagrama del kernel, no una captura: un cilindro real todavía no existe
        — esto es un prisma de ocho caras, con su límite dibujado a propósito.
      </figcaption>
    </figure>
  );
}

function ToolsetVisual({ templates }: { templates: readonly GalleryTemplate[] }) {
  return (
    <div data-testid="capability-visual-toolsets">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {templates.map((template) => (
          <li key={template.id}>
            <Link
              href={`/plantillas/${template.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
            >
              <PlanRender
                id={template.id}
                label={template.label}
                widthM={template.widthM}
                heightM={template.heightM}
                sizes="(min-width: 640px) 16vw, 50vw"
                className="block border-b border-border"
              />
              <span className="flex flex-col p-3">
                <span className="type-micro text-primary-ink">
                  {template.giroLabel}
                </span>
                <span className="type-small mt-0.5 font-semibold text-foreground">
                  {template.label}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="type-small mt-3 text-muted-foreground">
        Plano dibujado por el motor de plantillas real, el mismo que sirve{" "}
        <Link
          href="/plantillas"
          className="underline underline-offset-4 hover:text-foreground"
        >
          el catálogo completo
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * MAQUETA DE LA PALETA DE REVISIÓN — construida con las mismas primitivas del
 * producto (Surface, Badge, tokens de tipografía), NO una captura. No lleva
 * nombre de persona ni logotipo: nada aquí es un testimonio, es el mismo dato
 * que ya describe el texto —versión, comentario anclado, enlace con
 * caducidad— puesto en la forma en que el editor de verdad lo muestra.
 */
function CollaborationMock() {
  return (
    <Surface
      radius="card"
      padded="lg"
      className="flex flex-col gap-4"
      data-testid="capability-visual-colaboracion"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="type-caption text-muted-foreground">Documento</p>
          <p className="type-small font-semibold text-foreground">
            Planta baja · Casa habitación
          </p>
        </div>
        <Badge tone="success" dot>
          Guardado
        </Badge>
      </div>

      <div className="rounded-control border border-border bg-muted/40 p-3">
        <p className="type-caption text-muted-foreground">Versiones</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          <li className="flex items-center justify-between gap-3">
            <span className="type-small text-foreground">
              Versión 7 · autoguardado
            </span>
            <span className="type-mono type-micro text-muted-foreground">
              hace 2 min
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="type-small text-muted-foreground">
              Versión 6 · guardado manual
            </span>
            <span className="type-mono type-micro text-muted-foreground">
              ayer
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-control border border-border p-3">
        <p className="type-caption text-muted-foreground">
          Comentario anclado a la geometría
        </p>
        <p className="type-small mt-1.5 text-foreground">
          «Este muro necesita 20&nbsp;cm más de espesor por norma.»
        </p>
        <p className="type-micro mt-1.5 text-muted-foreground">
          Compañero de equipo · muro norte · 2 respuestas
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-control border border-border p-3">
        <span className="type-small text-muted-foreground">
          Enlace de revisión
        </span>
        <Badge tone="neutral">Caduca en 7 días</Badge>
      </div>
    </Surface>
  );
}

const STATIC_VISUALS: Partial<Record<CapabilityTabId, () => ReactNode>> = {
  dibujo: DibujoVisual,
  anotacion: AnotacionVisual,
  entrega: EntregaVisual,
  "3d": SolidFacetDiagram,
  colaboracion: CollaborationMock,
};

/**
 * EL PANEL, SIN ESTADO PROPIO.
 *
 * Separado de `CapabilityExplorer` a propósito: un componente controlado por
 * `activeId` se puede renderizar a marcado estático con cualquier pestaña
 * activa sin simular un clic, que es justo lo que
 * `CapabilityExplorer.spec.ts` necesita para comprobar que las seis pestañas
 * pintan contenido distinto — el mismo truco que ya usa
 * `primitives-contract.spec.ts` para probar `Tabs` con un `value` fijo.
 */
export function CapabilityExplorerPanels({
  activeId,
  toolsetTemplates,
}: {
  activeId: CapabilityTabId;
  toolsetTemplates: readonly GalleryTemplate[];
}) {
  return (
    <>
      {CAPABILITY_TABS.map((tab) => {
        const Visual = STATIC_VISUALS[tab.id];
        return (
          <TabPanel
            key={tab.id}
            id={tab.id}
            active={activeId === tab.id}
            className="draw-fade-in mt-10"
          >
            <div
              data-testid={`capability-panel-${tab.id}`}
              className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
            >
              <div>
                <p className="flex items-center gap-3 type-eyebrow text-primary-ink">
                  <span className="type-sheet-number opacity-85">
                    {tab.numero}
                  </span>
                  {tab.eyebrow}
                </p>
                <h3 className="type-heading mt-3">{tab.title}</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {tab.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="type-body flex gap-3 text-muted-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
                {tab.limite ? (
                  <p className="type-small mt-6 border-t border-border pt-4 text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Límite actual:{" "}
                    </span>
                    {tab.limite}
                  </p>
                ) : null}
              </div>
              <div>
                {tab.id === "toolsets" ? (
                  <ToolsetVisual templates={toolsetTemplates} />
                ) : Visual ? (
                  <Visual />
                ) : null}
              </div>
            </div>
          </TabPanel>
        );
      })}
    </>
  );
}

/**
 * EL EXPLORADOR, CON SU ESTADO.
 *
 * `initialTabId` existe por dos razones: deja a un enlace externo entrar
 * directo en «3D» o «Toolsets» el día que haga falta, y le da al spec estático
 * una forma de pedir cualquier pestaña sin simular un clic ni montar un DOM
 * vivo (ver `CapabilityExplorerPanels` arriba).
 */
export function CapabilityExplorer({
  className,
  initialTabId = CAPABILITY_TABS[0].id,
  toolsetTemplates,
}: {
  className?: string;
  initialTabId?: CapabilityTabId;
  /**
   * Resuelto en el SERVIDOR por `page.tsx` (`galleryTemplate` sobre los ids
   * de `./capability-explorer-shared`) y bajado ya plano — ver la nota en
   * ese archivo.
   */
  toolsetTemplates: readonly GalleryTemplate[];
}) {
  const [activeId, setActiveId] = useState<CapabilityTabId>(initialTabId);

  return (
    <div className={cx("mt-12", className)} data-testid="capability-explorer">
      <Tabs
        label="Capacidades por disciplina"
        value={activeId}
        onChange={(id) => setActiveId(id as CapabilityTabId)}
        items={CAPABILITY_TABS.map((tab) => ({
          id: tab.id,
          label: (
            <span className="inline-flex items-center gap-2">
              <tab.icon aria-hidden="true" className="h-4 w-4" />
              {tab.tabLabel}
            </span>
          ),
          "data-testid": `capability-tab-${tab.id}`,
        }))}
      />
      <CapabilityExplorerPanels
        activeId={activeId}
        toolsetTemplates={toolsetTemplates}
      />
    </div>
  );
}

export { CAPABILITY_TABS };
// `TOOLSET_TEMPLATE_IDS` vive en ./capability-explorer-shared (sin "use
// client"): no se reexporta aquí — ver la nota en ese archivo sobre por qué
// re-exportar una constante desde un módulo cliente rompe en el servidor.
export type { CapabilityTabId };
