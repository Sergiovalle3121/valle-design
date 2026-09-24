import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");

function parse(source, file) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Las claves canónicas nunca son el rótulo de la ficha Esencial. */
export function rawPropertyLabels(source) {
  const ast = parse(source, "human-property-model.ts");
  const violations = [];
  function inspect(key, label) {
    if (!key || !label || !ts.isStringLiteral(key) || !ts.isStringLiteral(label)) return;
    const human = label.text.trim();
    // «Color» es la palabra normal para esta propiedad en español; el nombre
    // interno coincide por accidente. No exime otra clave ni otra grafía.
    if (key.text === "color" && human === "Color") return;
    if (
      human.toLowerCase() === key.text.toLowerCase() ||
      /[*_]|[a-z][A-Z]/.test(human) ||
      /^(?:start|end|host|layout|layer|thickness|height|width|vertices|radius|diameter|length|color|area|perimeter|angle)$/i.test(
        human,
      )
    )
      violations.push(`${key.text} → ${human}`);
  }
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "field" &&
      node.arguments.length >= 2
    ) {
      const [key, label] = node.arguments;
      inspect(key, label);
    }
    // La selección histórica crea campos como objetos, sin llamar a field().
    if (ts.isObjectLiteralExpression(node)) {
      const named = (name) => node.properties.find((property) =>
        ts.isPropertyAssignment(property) && property.name.getText(ast) === name);
      inspect(named("key")?.initializer, named("label")?.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return violations;
}

/** Exige rótulos humanos en Esencial y que su árbol no monte la tabla técnica. */
export function essentialPropertyViewViolations(humanView, panel) {
  const violations = [];
  const ast = parse(humanView, "CadHumanProperties.tsx");
  let foundLabel = false;
  function visit(node) {
    if (
      ts.isJsxExpression(node) &&
      node.expression?.getText(ast) === "field.key" &&
      ts.isJsxElement(node.parent)
    )
      violations.push("la ficha pinta la clave cruda");
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(ast) === "dt"
    ) {
      const content = node.children.map((child) => child.getText(ast)).join("");
      if (content.includes("field.label")) foundLabel = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!foundLabel) violations.push("la ficha no pinta el rótulo humano");
  const panelAst = parse(panel, "CadEntityPropertiesPanel.tsx");
  let essentialReturn;
  let technical;
  function visitPanel(node) {
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(panelAst) === 'mode === "esencial"' &&
      node.thenStatement.getText(panelAst).includes("<CadHumanProperties")
    )
      essentialReturn = node;
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(panelAst) === "CadPropertiesPalette"
    )
      technical = node;
    ts.forEachChild(node, visitPanel);
  }
  visitPanel(panelAst);
  if (!essentialReturn)
    violations.push("Esencial no sale antes de construir la tabla técnica");
  if (!technical) violations.push("Pro perdió su tabla técnica");
  if (essentialReturn && technical && technical.pos < essentialReturn.end)
    violations.push("la tabla técnica se monta antes de salir de Esencial");
  return violations;
}

/** La selección histórica de Esencial también debe usar la ficha humana. */
export function legacyPropertyViewViolations(legacyView, editor) {
  const violations = [];
  const legacyAst = parse(legacyView, "CadEssentialLegacyProperties.tsx");
  let humanView = false;
  let technicalView = false;
  function visitLegacy(node) {
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(legacyAst);
      if (tag === "CadHumanProperties") humanView = true;
      if (tag === "CadPropertiesPalette") technicalView = true;
    }
    ts.forEachChild(node, visitLegacy);
  }
  visitLegacy(legacyAst);
  if (!humanView) violations.push("la selección histórica de Esencial no usa la ficha humana");
  if (technicalView) violations.push("la selección histórica de Esencial monta la tabla técnica");

  const editorAst = parse(editor, "Layout3DEditor.tsx");
  let guardedMount = false;
  function visitEditor(node) {
    if (
      ts.isConditionalExpression(node) &&
      node.condition.getText(editorAst) === 'uiMode === "esencial"' &&
      node.whenTrue.getText(editorAst).includes("<CadEssentialLegacyProperties")
    )
      guardedMount = true;
    ts.forEachChild(node, visitEditor);
  }
  visitEditor(editorAst);
  if (!guardedMount) violations.push("la ficha histórica no está limitada al modo Esencial");
  return violations;
}
