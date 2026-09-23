import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell, PublicSection } from "../docs/PublicPageShell";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = {
  ...publicPageMetadata({
    path: "/privacidad",
    title: "Aviso de privacidad — borrador",
    description:
      "Borrador del aviso de privacidad de VALLECAD, pendiente de completar y revisar.",
  }),
  robots: { index: false, follow: false },
};

export default function PrivacidadPage() {
  return (
    <PublicPageShell
      eyebrow="Información legal"
      title="Aviso de privacidad"
      intro="Borrador para revisión de Sergio"
    >
      <p
        role="status"
        className="type-body rounded-card border border-border bg-card p-5 text-foreground"
      >
        Este texto aún requiere los datos del responsable, un canal para ejercer
        derechos y revisión jurídica. El{" "}
        <Link href="/privacy" className="underline">
          aviso vigente
        </Link>{" "}
        sigue disponible.
      </p>

      <PublicSection title="Quién trata los datos">
        <p>
          VALLECAD es el nombre del servicio. La identidad jurídica del
          responsable y su domicilio deben verificarse antes de aprobar este
          aviso.
        </p>
        <p>
          <strong>
            Identidad o razón social del responsable: pendiente de Sergio.
          </strong>
        </p>
        <p>
          <strong>Domicilio del responsable: pendiente de Sergio.</strong>
        </p>
      </PublicSection>

      <PublicSection title="Qué datos se tratan">
        <p>
          Para crear y usar una cuenta: nombre visible, correo electrónico,
          datos necesarios para verificar la identidad y mantener la sesión,
          organización y membresías.
        </p>
        <p>
          Para operar el dibujo: proyectos, documentos, planos y contenido que
          la persona usuaria decida guardar o compartir. Si se solicitan
          comprobantes fiscales, se tratan los datos fiscales que proporcione la
          organización.
        </p>
        <p>
          Para atender incidencias: el reporte que la persona envíe y los datos
          técnicos que se le muestren antes de enviarlo.{" "}
          <strong>Datos personales sensibles:</strong> este servicio no los
          solicita como requisito de alta; falta confirmar si algún flujo
          específico podría recibirlos de forma incidental.
        </p>
      </PublicSection>

      <PublicSection title="Para qué se usan">
        <p>
          Las finalidades necesarias para prestar el servicio son crear y
          proteger la cuenta, aplicar permisos, guardar y mostrar los
          documentos, atender soporte, gestionar pagos cuando estén habilitados
          y cumplir obligaciones fiscales cuando correspondan.
        </p>
        <p>
          <strong>Finalidades opcionales:</strong> pendiente de Sergio confirmar
          si habrá comunicaciones comerciales u otros usos no necesarios. Si se
          activan, se deberán explicar y obtener el consentimiento que
          corresponda antes de tratar los datos para ese fin.
        </p>
      </PublicSection>

      <PublicSection title="Proveedores y transferencias">
        <p>
          La operación puede requerir servicios de alojamiento, correo
          transaccional, pagos y facturación.{" "}
          <strong>
            Lista de proveedores, funciones, ubicación y transferencias
            internacionales: pendiente de verificar antes de aprobar el aviso.
          </strong>{" "}
          Este borrador no presume consentimiento para transferencias que lo
          requieran.
        </p>
      </PublicSection>

      <PublicSection title="Cómo limitar el uso y ejercer derechos ARCO">
        <p>
          La persona titular puede solicitar acceso, rectificación, cancelación
          u oposición respecto de sus datos. La solicitud deberá identificar a
          la persona o representante, describir los datos y señalar el derecho
          que desea ejercer.
        </p>
        <p>
          <strong>
            Correo o medio para ejercer derechos ARCO: pendiente de Sergio.
          </strong>{" "}
          También quedan pendientes el procedimiento operativo, la persona
          responsable de atenderlo y las opciones para limitar usos no
          necesarios. No se presenta un correo no verificado como canal activo.
        </p>
      </PublicSection>

      <PublicSection title="Conservación, cancelación y cambios">
        <p>
          <strong>
            Plazos de conservación y eliminación por tipo de dato: pendientes de
            definir.
          </strong>{" "}
          La política deberá explicar cómo se recuperan o exportan los planos al
          cancelar y qué datos se conservan por obligación legal.
        </p>
        <p>
          Los cambios de este aviso requerirán una versión nueva y un medio para
          comunicarlos a las personas titulares.{" "}
          <strong>
            Medio de notificación y fecha de entrada en vigor: pendientes de
            Sergio.
          </strong>
        </p>
      </PublicSection>

      <PublicSection title="Estado del documento">
        <p>
          Borrador para revisión de Sergio. Redactado el 23 de septiembre de
          2026; sin aprobación jurídica ni fecha de entrada en vigor. Consulta
          los{" "}
          <Link href="/terminos" className="underline">
            términos en borrador
          </Link>
          .
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
