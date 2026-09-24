import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");

// Lista finita de fugas de implementación observadas. Este análisis estático
// impide esas recaídas; no certifica por sí solo cero jerga en el navegador.
// El diagnóstico permanece fuera de la vista normal y del árbol de
// accesibilidad dentro de CadDiagnosticsReadout.
const INTERNAL_COPY = [
  /\bTool:/i,
  /\bAPI en línea\b/i,
  /\bAPI sin conexión\b/i,
  /\bdemo-local\b/i,
  /\bRelease Sin validar\b/i,
  /\bNative \d/i,
  /\bLotes \d/i,
  /\bViewport \d/i,
  /\bmalla\(s\)/i,
  /\bU\d+\/R\d+\b/i,
  /\bcolocados\s*·\s*\d+\s*heredados\b/i,
  /\bgzip-json\b/i,
  /\btenant\b/i,
  /\bworkspace\b/i,
  /\bjournal\b/i,
  /\bworker\b/i,
  // Son términos de implementación que la cabecera de selección llegó a
  // enseñar incluso en Pro. El tipo DXF concreto sí es dato útil allí.
  /\bgeometría canónica\b/i,
  /\bcurvas nativas\b/i,
];

/** Inspecciona texto JSX y rótulos literales; ignora comentarios e importaciones. */
export function visibleCopyViolations(source, file = "component.tsx") {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];
  function inspect(text, node) {
    for (const pattern of INTERNAL_COPY) {
      if (!pattern.test(text)) continue;
      const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      violations.push(`${file}:${line + 1}: ${pattern.source}`);
    }
  }
  function visit(node, withinJsx = false, diagnostic = false) {
    if (ts.isJsxElement(node)) {
      const hidden = diagnostic || node.openingElement.tagName.getText(ast) === "CadDiagnosticsReadout";
      if (hidden) return;
      node.children.forEach((child) => visit(child, true, false));
      node.openingElement.attributes.properties.forEach((attribute) => visit(attribute, true, false));
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      node.attributes.properties.forEach((attribute) => visit(attribute, true, diagnostic));
      return;
    }
    if (ts.isJsxText(node)) inspect(node.text, node);
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(ast);
      if (/^(?:title|aria-label|placeholder|label|description)$/.test(name) && node.initializer)
        visit(node.initializer, true, diagnostic);
      return;
    }
    if (withinJsx && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)))
      inspect(node.text, node);
    if (withinJsx && ts.isTemplateExpression(node)) {
      // `${count} curvas nativas` y `Viewport ${n}` son texto visible aunque
      // sus números se calculen. No inspeccionar las expresiones interpoladas.
      inspect([node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" "), node);
    }
    // Los rótulos que se calculan antes del JSX también forman parte de la UI.
    if (!withinJsx && ts.isStringLiteral(node) && /^(?:API en línea|demo-local|Release Sin validar)$/.test(node.text))
      inspect(node.text, node);
    ts.forEachChild(node, (child) => visit(child, withinJsx, diagnostic));
  }
  visit(ast);
  return violations;
}
