/**
 * LAS PRIMITIVAS DE VALLE DESIGN.
 *
 * Punto único de importación: `import { Button, Input, Surface } from
 * "@/components/ui"`. Antes de esto, este directorio tenía UN archivo
 * (`LanguageSwitcher.tsx`) y la app tenía 329 `<button>`, 127 `<input>` y 44
 * `<select>` escritos a mano — cada uno con su propia idea del radio, del
 * relleno y del anillo de foco.
 *
 * REGLA que hace que esto no vuelva a pasar: ninguna primitiva escribe un hex.
 * Todo sale de los tokens de `globals.css`. Si un valor no existe como token,
 * se añade AL SISTEMA y se consume desde aquí — nunca un valor suelto en un
 * componente.
 */
export { Button, type ButtonProps } from "./Button";
export {
  Card,
  CardHeader,
  Surface,
  type SurfaceProps,
  type SurfaceTexture,
} from "./Card";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { controlClass, FieldShell } from "./Field";
export {
  Badge,
  ProgressBar,
  Skeleton,
  Tooltip,
  type BadgeProps,
  type ProgressBarProps,
  type SkeletonProps,
  type TooltipProps,
} from "./Feedback";
export {
  Input,
  Select,
  Textarea,
  type InputProps,
  type SelectProps,
  type TextareaProps,
} from "./Input";
export { Modal, type ModalProps } from "./Modal";
export { Spinner, type SpinnerProps } from "./Spinner";
export { TabPanel, Tabs, type TabItem, type TabsProps } from "./Tabs";
export { Checkbox, Switch, type CheckboxProps, type SwitchProps } from "./Toggle";
export {
  buttonClass,
  cx,
  disabledBase,
  elevation,
  focusRing,
  motionBase,
  radius,
  touchTarget,
  type ButtonSize,
  type ButtonVariant,
  type Elevation,
  type Radius,
} from "./styles";
