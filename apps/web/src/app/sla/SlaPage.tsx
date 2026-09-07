"use client";

import { useEffect, useState } from "react";
import { fetchPublicCatalog } from "@/lib/commercial/public-catalog";
import type { PublicCatalog } from "@/lib/commercial/pricing";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { COMMERCIAL_LINKS } from "@/config/commercial";

/**
 * T-62(b) — EL SLA QUE NADIE PODÍA VER.
 *
 * `docs/ops/SLA.md` existía, era honesto y vivía enterrado en el repositorio.
 * Peor: sus columnas llevaban los nombres de una propuesta comercial vieja,
 * que no existen en ningún sitio donde alguien pueda comprarlos — el
 * catálogo vendible usa otros tres. Publicar la tabla con nombres inventados
 * habría sido peor que no publicarla.
 *
 * Por eso esta página NO escribe los nombres a mano: los lee del mismo
 * catálogo público que `/precios` (`fetchPublicCatalog`), por código de plan.
 * Si el catálogo cambia un nombre, esta tabla lo seguiría en el siguiente
 * despliegue en vez de quedarse diciendo el nombre viejo. Mientras el
 * catálogo no responda (carga o error de red), se enseña el nombre de
 * respaldo — la tabla nunca se queda vacía por un fallo de red.
 */

const COLUMNAS = [
  { code: "standalone-trial", respaldo: "Prueba" },
  { code: "individual", respaldo: "Individual" },
  { code: "despacho", respaldo: "Despacho" },
] as const;

function nombresDeColumna(catalog: PublicCatalog | null): string[] {
  return COLUMNAS.map((columna) => {
    const plan = catalog?.items.find(
      (item: PublicCatalog["items"][number]) => item.code === columna.code,
    );
    return plan?.name ?? columna.respaldo;
  });
}

function Tabla({
  nombres,
  encabezado,
  filas,
}: {
  nombres: string[];
  encabezado: string;
  filas: Array<[string, string, string, string]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="type-small py-2 pr-4 font-medium text-foreground">
              {encabezado}
            </th>
            {nombres.map((nombre) => (
              <th
                key={nombre}
                className="type-small py-2 pr-4 font-medium text-foreground"
              >
                {nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map(([etiqueta, ...valores]) => (
            <tr key={etiqueta}>
              <td className="type-small py-2 pr-4 text-muted-foreground">
                {etiqueta}
              </td>
              {valores.map((valor, index) => (
                <td
                  key={`${etiqueta}-${index}`}
                  className="type-small py-2 pr-4 text-foreground"
                >
                  {valor}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SlaPage() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const catalogo = await fetchPublicCatalog({
          signal: controller.signal,
        });
        setCatalog(catalogo);
      } catch {
        // El nombre de respaldo cubre el fallo de red; no hay nada más que
        // hacer aquí (ver `nombresDeColumna`).
      }
    })();
    return () => controller.abort();
  }, []);

  const nombres = nombresDeColumna(catalog);

  return (
    <PublicPageShell
      eyebrow="Operación"
      title="Niveles de servicio"
      intro="Compromisos de disponibilidad, respaldo y respuesta, con la misma fuente que usa el resto del producto: el catálogo real, no una propuesta aparte."
    >
      <PublicSection title="Disponibilidad y respaldo por plan">
        <Tabla
          nombres={nombres}
          encabezado=""
          filas={[
            [
              "Objetivo de disponibilidad mensual",
              "sin compromiso",
              "99,5 %",
              "99,9 %",
            ],
            ["Canal de soporte", "correo", "correo", "correo + canal directo"],
            ["Cobertura", "hábil", "hábil", "24×7 para Sev-1"],
            ["Retención de backups", "7 días", "30 días", "90 días"],
            ["Frecuencia de backup", "diaria", "cada 6 h", "cada hora"],
            [
              "Restauración de prueba verificada",
              "trimestral",
              "mensual",
              "semanal",
            ],
          ]}
        />
        <p>
          <strong>{nombres[0]} no lleva compromiso de disponibilidad</strong>, y
          es una decisión honesta: el servicio no tiene todavía historial
          operativo suficiente para comprometer un porcentaje durante los 14
          días de evaluación. Sí lleva procedimiento de backup y restauración
          verificada desde el primer día.
        </p>
      </PublicSection>

      <PublicSection title="Tiempo de respuesta a incidentes">
        <p>
          Tiempo de <strong>respuesta</strong>: un humano confirma que trabaja
          en ello. No es tiempo de resolución — comprometer una resolución para
          un fallo aún sin diagnosticar produce una mentira o una prisa
          peligrosa.
        </p>
        <Tabla
          nombres={nombres}
          encabezado="Severidad"
          filas={[
            [
              "Sev-1 (servicio caído, pérdida o exposición de datos)",
              "siguiente día hábil",
              "4 h hábiles",
              "1 h, 24×7",
            ],
            [
              "Sev-2 (degradación que bloquea guardar, abrir o registrarse)",
              "3 días hábiles",
              "1 día hábil",
              "4 h hábiles",
            ],
            [
              "Sev-3 (fallo acotado, con alternativa)",
              "mejor esfuerzo",
              "3 días hábiles",
              "1 día hábil",
            ],
          ]}
        />
      </PublicSection>

      <PublicSection title="Recuperación ante desastre (RPO / RTO)">
        <Tabla
          nombres={nombres}
          encabezado=""
          filas={[
            ["RPO — datos que se pueden perder", "24 h", "6 h", "1 h"],
            ["RTO — objetivo de restauración", "8 h hábiles", "4 h", "2 h"],
          ]}
        />
        <p>
          El RPO <strong>es</strong> la frecuencia de backup, y sólo cuenta si
          cada respaldo está verificado: uno que nunca se restauró no reduce el
          RPO, sólo lo aparenta.
        </p>
      </PublicSection>

      <PublicSection title="Lo que este nivel de servicio NO cubre">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Sin réplica en caliente: la recuperación pasa por restaurar un
            backup, no por conmutar a un respaldo activo.
          </li>
          <li>
            Sin multi-región: una caída de la región del proveedor es una
            indisponibilidad, no un evento de conmutación.
          </li>
          <li>
            Sin compromiso de rendimiento del editor CAD en el navegador del
            cliente: depende de su máquina, su GPU y el tamaño de su documento.
          </li>
          <li>
            El producto no promete compatibilidad DWG nativa, y ese límite no
            entra en ningún nivel de servicio.
          </li>
          <li>
            Créditos por incumplimiento: este documento declara objetivos
            técnicos y procedimientos; las consecuencias contractuales se pactan
            en el acuerdo escrito con el cliente.
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Borrador pendiente de revisión legal">
        <p>
          Este texto lo redactó el equipo de producto a partir de lo que el
          sistema puede medir hoy (`docs/ops/SLA.md`, con sus consultas y
          procedimientos ejecutables).{" "}
          <strong>No ha pasado revisión legal profesional</strong> y no
          sustituye el acuerdo escrito que requiere un compromiso de
          disponibilidad vinculante.
        </p>
        <a className={publicActionClass} href={COMMERCIAL_LINKS.sales}>
          Pedir el acuerdo por escrito
        </a>
      </PublicSection>
    </PublicPageShell>
  );
}
