export type CadAcceptanceEvidenceLevel = 'browser-proven' | 'tested' | 'performance';

export interface CadAcceptanceJourneyStep {
  step: number;
  action: string;
  level: CadAcceptanceEvidenceLevel;
  evidence: string[];
}

const golden = (name: string) => `apps/web/e2e/golden/${name}`;
const performance = 'apps/web/e2e/performance/cad-viewport-100k.spec.ts';

/**
 * Canonical, reviewable evidence map for the 50-step neutral CAD journey.
 * `tested` is deliberately weaker than `browser-proven`; the checker keeps the
 * distinction visible so a unit test can never silently masquerade as E2E.
 */
export const CAD_ACCEPTANCE_JOURNEY: readonly CadAcceptanceJourneyStep[] = [
  { step: 1, action: 'Abrir dibujo', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 2, action: 'Elegir unidades', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 3, action: 'Crear capas', level: 'browser-proven', evidence: [golden('24-cad-canonical-layers.spec.ts'), golden('26-cad-precision-polyline.spec.ts')] },
  { step: 4, action: 'Dibujar con coordenadas absolutas', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 5, action: 'Dibujar con relativas', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 6, action: 'Usar polar', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 7, action: 'Usar dynamic input', level: 'browser-proven', evidence: [golden('13-cad-dynamic-input.spec.ts'), golden('26-cad-precision-polyline.spec.ts')] },
  { step: 8, action: 'Usar endpoint', level: 'browser-proven', evidence: [golden('28-cad-osnap-pointer.spec.ts')] },
  { step: 9, action: 'Usar midpoint', level: 'browser-proven', evidence: [golden('28-cad-osnap-pointer.spec.ts')] },
  { step: 10, action: 'Usar intersection', level: 'browser-proven', evidence: [golden('28-cad-osnap-pointer.spec.ts')] },
  { step: 11, action: 'Usar perpendicular', level: 'browser-proven', evidence: [golden('28-cad-osnap-pointer.spec.ts')] },
  { step: 12, action: 'Usar tangent', level: 'browser-proven', evidence: [golden('28-cad-osnap-pointer.spec.ts')] },
  { step: 13, action: 'Crear polilínea cerrada', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 14, action: 'Aplicar offset', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 15, action: 'Trim', level: 'browser-proven', evidence: [golden('25-cad-trim-extend.spec.ts')] },
  { step: 16, action: 'Extend', level: 'browser-proven', evidence: [golden('25-cad-trim-extend.spec.ts')] },
  { step: 17, action: 'Fillet', level: 'browser-proven', evidence: [golden('23-cad-native-fillet.spec.ts')] },
  { step: 18, action: 'Window selection', level: 'browser-proven', evidence: [golden('12-cad-professional-selection.spec.ts')] },
  { step: 19, action: 'Crossing selection', level: 'browser-proven', evidence: [golden('12-cad-professional-selection.spec.ts')] },
  { step: 20, action: 'Lasso', level: 'browser-proven', evidence: [golden('12-cad-professional-selection.spec.ts')] },
  { step: 21, action: 'Selection cycling', level: 'browser-proven', evidence: [golden('12-cad-professional-selection.spec.ts')] },
  { step: 22, action: 'Editar grips', level: 'browser-proven', evidence: [golden('12-cad-professional-selection.spec.ts')] },
  { step: 23, action: 'Crear HATCH por punto interior', level: 'browser-proven', evidence: [golden('14-cad-associative-hatch.spec.ts')] },
  { step: 24, action: 'Cambiar boundary y comprobar associativity', level: 'browser-proven', evidence: [golden('14-cad-associative-hatch.spec.ts')] },
  { step: 25, action: 'Crear MTEXT', level: 'browser-proven', evidence: [golden('15-cad-native-mtext.spec.ts')] },
  { step: 26, action: 'Crear dimensiones asociativas', level: 'browser-proven', evidence: [golden('16-cad-associative-dimensions.spec.ts')] },
  { step: 27, action: 'Mover geometría y verificar cotas', level: 'browser-proven', evidence: [golden('16-cad-associative-dimensions.spec.ts')] },
  { step: 28, action: 'Crear MLEADER', level: 'browser-proven', evidence: [golden('17-cad-native-mleader.spec.ts')] },
  { step: 29, action: 'Crear bloque', level: 'browser-proven', evidence: [golden('18-cad-professional-blocks.spec.ts')] },
  { step: 30, action: 'Insertar múltiples instancias', level: 'browser-proven', evidence: [golden('18-cad-professional-blocks.spec.ts')] },
  { step: 31, action: 'Cambiar atributo', level: 'browser-proven', evidence: [golden('18-cad-professional-blocks.spec.ts')] },
  { step: 32, action: 'Crear layout', level: 'browser-proven', evidence: [golden('20-cad-multiple-viewports.spec.ts')] },
  { step: 33, action: 'Crear varios viewports', level: 'browser-proven', evidence: [golden('20-cad-multiple-viewports.spec.ts')] },
  { step: 34, action: 'Aplicar escalas', level: 'browser-proven', evidence: [golden('20-cad-multiple-viewports.spec.ts')] },
  { step: 35, action: 'Aplicar override de capa', level: 'browser-proven', evidence: [golden('20-cad-multiple-viewports.spec.ts')] },
  { step: 36, action: 'Publicar PDF', level: 'browser-proven', evidence: [golden('20-cad-multiple-viewports.spec.ts')] },
  { step: 37, action: 'Guardar', level: 'browser-proven', evidence: [golden('26-cad-precision-polyline.spec.ts')] },
  { step: 38, action: 'Cerrar', level: 'browser-proven', evidence: [golden('10-cad-native-entities.spec.ts'), golden('11-cad-recovery-journal.spec.ts')] },
  { step: 39, action: 'Recuperar un borrador', level: 'browser-proven', evidence: [golden('11-cad-recovery-journal.spec.ts')] },
  { step: 40, action: 'Recargar', level: 'browser-proven', evidence: [golden('10-cad-native-entities.spec.ts')] },
  { step: 41, action: 'Comparar revisiones', level: 'browser-proven', evidence: [golden('22-cad-compare-collaboration.spec.ts')] },
  { step: 42, action: 'Importar DXF', level: 'browser-proven', evidence: [golden('27-cad-dxf-loss-manifest.spec.ts')] },
  { step: 43, action: 'Editar importado', level: 'browser-proven', evidence: [golden('27-cad-dxf-loss-manifest.spec.ts')] },
  { step: 44, action: 'Exportar DXF', level: 'browser-proven', evidence: [golden('27-cad-dxf-loss-manifest.spec.ts')] },
  { step: 45, action: 'Verificar loss manifest', level: 'browser-proven', evidence: [golden('27-cad-dxf-loss-manifest.spec.ts')] },
  { step: 46, action: 'Abrir 10k', level: 'performance', evidence: [performance] },
  { step: 47, action: 'Medir 10k', level: 'performance', evidence: [performance] },
  { step: 48, action: 'Abrir 100k', level: 'performance', evidence: [performance] },
  { step: 49, action: 'Seleccionar entidad inicialmente fuera del viewport', level: 'performance', evidence: [performance] },
  { step: 50, action: 'Medir y producir artefactos', level: 'performance', evidence: [performance] },
];
