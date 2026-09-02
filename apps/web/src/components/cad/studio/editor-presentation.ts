/**
 * Presentación del editor heredado: temas de escena y tabla de atajos.
 *
 * Dos tablas de datos puros —ni React, ni THREE, ni estado— que ocupaban un
 * centenar de líneas dentro de `Layout3DEditor.tsx`. Cambiar un color de tema o
 * añadir un atajo a la ayuda no debería exigir abrir un archivo de 22.000
 * líneas, y ahora no lo exige.
 */

/** Visual theme presets for the scene (background / fog / floor / grid). */
export type Theme3D = "dark" | "light" | "night" | "studio";
export const THEMES: Record<
  Theme3D,
  {
    bg: number;
    ground: number;
    gridA: number;
    gridB: number;
    fog: number;
    label: string;
  }
> = {
  dark: {
    bg: 0x0a0f1e,
    ground: 0x14203a,
    gridA: 0x2a3a5c,
    gridB: 0x1b2640,
    fog: 0x0a0f1e,
    label: "Oscuro",
  },
  light: {
    bg: 0xeaf0f8,
    ground: 0xd7e2f1,
    gridA: 0x9db4d6,
    gridB: 0xbccce4,
    fog: 0xeaf0f8,
    label: "Claro",
  },
  night: {
    bg: 0x05070d,
    ground: 0x0b1322,
    gridA: 0x1e2c47,
    gridB: 0x121a2e,
    fog: 0x05070d,
    label: "Noche",
  },
  studio: {
    bg: 0x202329,
    ground: 0x2b2f37,
    gridA: 0x3c424d,
    gridB: 0x2f343d,
    fog: 0x202329,
    label: "Estudio",
  },
};

/**
 * Los atajos que el panel «Atajos y ayuda (?)» anuncia.
 *
 * ── Por qué esta lista merece un gate propio ──────────────────────────────
 *
 * Es la primera cosa que abre alguien que viene de AutoCAD, y es TEXTO: no
 * compila, no se rompe cuando cambia lo que describe. Al auditarla contra el
 * registro real (`lib/cad/keyboard-shortcuts.ts`) decía que **L conecta flujo**,
 * cuando `L` es LINE —trazar muros— y el conector es `Shift+L`. Alguien en su
 * primera hora pulsaba L esperando unir dos objetos y le salía un muro. Además
 * se callaba veinte atajos que sí existen, entre ellos Ctrl+S, la paleta Ctrl+K
 * y las siete teclas de función que un dibujante usa sin mirar.
 *
 * `shortcuts-help.spec.ts` compara ahora fila por fila contra el registro: lo
 * que se anuncie tiene que hacer lo que dice, y lo que exista tiene que estar
 * anunciado o declarado.
 *
 * Las teclas que NO viven en el registro —W, ?, \, las flechas, el recorrido a
 * pie— las atiende el propio editor y se marcan en el gate como tales.
 */
/*
 * Sin filas para W, P, B, Z, V, M, A, E, R, S, X, G, O ni F: trece de ellas
 * eran alias de una letra de acad.pgp (MOVE, ERASE, OFFSET, PAN, ZOOM, ARC,
 * BLOCK, FILLET, GROUP, VIEW, WBLOCK, STRETCH, EXPLODE) y el lienzo ya no las
 * roba; R rotaba +15° sin preguntar mientras aquí prometía «pide grados», y
 * Shift+L (connector) no tenía salida en ninguna fase (medido: null). La
 * letra suelta es de la línea de comandos: `shortcuts-help.spec.ts` impide
 * que vuelvan.
 */
export const HELP_SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Dibujar",
    rows: [
      ["L", "Trazar líneas encadenadas"],
      ["C", "Círculo por centro y radio"],
      ["T", "Agregar nota de texto"],
      ["I", "Biblioteca de símbolos y bloques"],
    ],
  },
  {
    title: "Herramientas",
    rows: [
      ["Shift+O", "Desfasar la selección (offset)"],
      ["Ctrl/⌘+K", "Paleta de comandos"],
      ["Shift+V", "Revisión de diseño"],
      ["Recorrido", "Caminar en primera persona"],
    ],
  },
  {
    title: "Selección",
    rows: [
      ["Clic", "Seleccionar un objeto"],
      ["Shift+clic", "Agregar / quitar de la selección"],
      ["Ctrl/⌘+A", "Seleccionar todo"],
      ["Esc", "Deseleccionar / salir / cerrar"],
    ],
  },
  {
    title: "Edición",
    rows: [
      ["Arrastrar", "Mover (en grupo si hay varios)"],
      ["← → ↑ ↓", "Ajustar (Shift = ×5)"],
      ["Ctrl/⌘+D", "Duplicar"],
      ["Supr", "Borrar selección"],
      ["Ctrl/⌘+Z", "Deshacer"],
      ["Ctrl/⌘+Shift+Z", "Rehacer"],
      ["Ctrl/⌘+S", "Guardar"],
    ],
  },
  {
    title: "Ayudas al dibujo",
    rows: [
      ["F3", "Snap a objetos"],
      ["F7", "Grilla"],
      ["F8", "Ortho"],
      ["F9", "Forzar el cursor a la rejilla"],
      ["F10", "Rastreo polar"],
      ["F11", "Rastreo desde puntos OSNAP"],
      ["F12", "Entrada dinámica junto al cursor"],
    ],
  },
  {
    title: "Vista",
    rows: [
      ["Arrastrar fondo", "Orbitar"],
      ["Rueda", "Acercar / alejar"],
      ["Shift+F", "Ajustar a toda la planta"],
      ["\\", "Modo foco (ocultar paneles)"],
      ["Recorrido", "Arrastrar = mirar · WASD = caminar"],
      ["?", "Mostrar esta ayuda"],
    ],
  },
];
