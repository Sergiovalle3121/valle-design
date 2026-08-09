"use client";

/**
 * Los cuadros flotantes de las paletas: DSETTINGS y el gestor de estilos.
 *
 * Es un CONTENEDOR, no una paleta: sabe cuál está abierta, calcula lo que cada
 * una necesita del documento y monta el fondo oscuro. Las paletas de dentro
 * siguen siendo presentacionales puras.
 *
 * Existe por el trinquete. Montar dos cuadros con sus quince props cada uno
 * dentro del JSX de 6.300 líneas del monolito eran setenta líneas más en un
 * archivo que sólo puede encoger; aquí son veinte y quedan al lado de lo que
 * pintan.
 */
import React from "react";
import type { CadDocument } from "@/lib/cad/cad-document";
import { CadDraftSettingsDialog } from "./CadDraftSettingsDialog";
import { CadStyleManagerPalette } from "./CadStyleManagerPalette";
import {
  CAD_OSNAP_MODES,
  CAD_POLAR_INCREMENTS,
  type CadDraftSettingsHost,
  type CadDraftSettingsSnapshot,
} from "./draft-settings-host";
import type { CadPaletteHost, CadPaletteId } from "./palette-host";
import type {
  CadStyleManagerHost,
  CadStyleManagerSnapshot,
} from "./style-manager-host";
import {
  EMPTY_CAD_STYLES,
  cadStyleFamilyDescriptor,
  cadStyleRows,
  type CadStyleValue,
} from "./style-manager-model";
import { cadStyleUsage } from "./use-style-actions";

export interface CadPaletteOverlaysProps {
  open: CadPaletteId | null;
  paletteHost: CadPaletteHost;
  readOnly: boolean;
  document: CadDocument | null;

  draftSettingsHost: CadDraftSettingsHost;
  draftSettings: CadDraftSettingsSnapshot;
  /** La rejilla la sigue sosteniendo el editor; entra ya resuelta. */
  grid: { visible: boolean; snap: boolean; size: number };
  onToggleGridVisible: () => void;
  onToggleGridSnap: () => void;
  /** El cuadro habla en `string`; aquí se estrecha a `SnapType`. */
  onToggleOsnapMode: (mode: string, value: boolean) => void;

  styleManagerHost: CadStyleManagerHost;
  styleManager: CadStyleManagerSnapshot;
  onCreateStyle: () => void;
  onEditStyle: (name: string, key: string, value: CadStyleValue) => void;
  onDeleteStyle: (name: string) => void;
}

function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-[85] grid place-items-center bg-black/55 p-4"
      onClick={onClose}
    >
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}

export const CadPaletteOverlays = React.memo(function CadPaletteOverlays(
  props: CadPaletteOverlaysProps,
) {
  if (props.open === "draft-settings")
    return (
      <Backdrop onClose={props.paletteHost.close}>
        <CadDraftSettingsDialog
          settings={props.draftSettings}
          modes={CAD_OSNAP_MODES}
          polarIncrements={CAD_POLAR_INCREMENTS}
          grid={props.grid}
          onToggleOsnap={props.draftSettingsHost.toggleOsnap}
          onToggleMode={props.onToggleOsnapMode}
          onAllModes={props.draftSettingsHost.setAllOsnapModes}
          onResetModes={props.draftSettingsHost.resetOsnapModes}
          onToggleOrtho={props.draftSettingsHost.toggleOrtho}
          onTogglePolar={props.draftSettingsHost.togglePolar}
          onPolarIncrement={props.draftSettingsHost.setPolarIncrement}
          onToggleObjectSnapTracking={
            props.draftSettingsHost.toggleObjectSnapTracking
          }
          onClearTracking={props.draftSettingsHost.clearTrackingPoints}
          onToggleGridVisible={props.onToggleGridVisible}
          onToggleGridSnap={props.onToggleGridSnap}
          onClose={props.paletteHost.close}
        />
      </Backdrop>
    );

  if (props.open === "styles") {
    const family = props.styleManager.family;
    const descriptor = cadStyleFamilyDescriptor(family);
    return (
      <Backdrop onClose={props.paletteHost.close}>
        <CadStyleManagerPalette
          family={family}
          rows={cadStyleRows(
            props.document?.styles ?? EMPTY_CAD_STYLES,
            family,
          )}
          fields={descriptor.fields}
          usedBy={descriptor.usedBy}
          usage={cadStyleUsage(props.document, family)}
          draftName={props.styleManager.draftName}
          readOnly={props.readOnly}
          onFamily={props.styleManagerHost.setFamily}
          onDraftName={props.styleManagerHost.setDraftName}
          onCreate={props.onCreateStyle}
          onEdit={props.onEditStyle}
          onDelete={props.onDeleteStyle}
          onClose={props.paletteHost.close}
        />
      </Backdrop>
    );
  }

  return null;
});
