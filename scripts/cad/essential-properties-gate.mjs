import ts from "typescript";

function parse(source, file) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Las claves canónicas nunca son el rótulo de la ficha Esencial. */
export function rawPropertyLabels(source) {
  const ast = parse(source, "human-property-model.ts");
  const violations = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "field" && node.arguments.length >= 2) {
      const [key, label] = node.arguments;
      if (ts.isStringLiteral(key) && ts.isStringLiteral(label)) {
        const human = label.text.trim();
        if (human.toLowerCase() === key.text.toLowerCase() || /[*_]|[a-z][A-Z]/.test(human)
          || /^(?:start|end|host|layout|layer|thickness|height|width|vertices|radius|diameter|length|color|area|perimeter|angle)$/i.test(human)) {
          violations.push(`${key.text} → ${human}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return violations;
}

/** Exige que la vista use el rótulo y que la tabla técnica esté plegada. */
export function essentialPropertyViewViolations(humanView, panel) {
  const violations = [];
  const ast = parse(humanView, "CadHumanProperties.tsx");
  let foundLabel = false;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "dt") {
      const content = node.children.map((child) => child.getText(ast)).join("");
      if (content.includes("field.key")) violations.push("la ficha pinta la clave cruda");
      if (content.includes("field.label")) foundLabel = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!foundLabel) violations.push("la ficha no pinta el rótulo humano");
  const panelAst = parse(panel, "CadEntityPropertiesPanel.tsx");
  let detailsWrapsTechnical = false;
  function visitPanel(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(panelAst) === "details") {
      if (node.children.some((child) => child.getText(panelAst).includes("{technical}"))) detailsWrapsTechnical = true;
    }
    ts.forEachChild(node, visitPanel);
  }
  visitPanel(panelAst);
  if (!detailsWrapsTechnical) violations.push("la tabla técnica no está bajo Detalles técnicos");
  if (!panel.includes('if (mode === "pro") return technical;'))
    violations.push("la tabla cruda no queda reservada a Pro");
  return violations;
}
