const copyProps = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "accessibilityHint",
  "accessibilityLabel",
  "children",
  "defaultValue",
  "description",
  "label",
  "placeholder",
  "summary",
  "title",
]);

function checkExpression(node, report) {
  if (!node) return;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string" && node.value.trim()) report(node);
      break;
    case "TemplateLiteral":
      if (node.quasis.some(({ value }) => value.raw.trim())) report(node);
      break;
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      checkExpression(node.expression, report);
      break;
    default:
      checkBranches(node, report);
  }
}

function checkBranches(node, report) {
  switch (node.type) {
    case "ConditionalExpression":
      checkExpression(node.consequent, report);
      checkExpression(node.alternate, report);
      break;
    case "LogicalExpression":
      if (node.operator !== "&&") checkExpression(node.left, report);
      checkExpression(node.right, report);
      break;
    case "BinaryExpression":
      if (node.operator === "+") {
        checkExpression(node.left, report);
        checkExpression(node.right, report);
      }
      break;
    case "ArrayExpression":
      for (const item of node.elements) checkExpression(item, report);
      break;
  }
}

const buttonInputTypes = new Set(["button", "reset", "submit"]);

function isButtonInput({ name, attributes }) {
  if (name.type !== "JSXIdentifier" || name.name !== "input") return false;
  const type = attributes.find(
    (attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "type",
  )?.value;
  const value = type?.type === "JSXExpressionContainer" ? type.expression : type;
  const staticType = readStaticString(value);
  return typeof staticType === "string" && buttonInputTypes.has(staticType.toLowerCase());
}

function readStaticString(value) {
  if (value?.type === "Literal") return value.value;
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0)
    return value.quasis[0].value.cooked;
  return undefined;
}

export const noUiLiteral = {
  meta: { messages: { literal: "Put visible or accessible copy in the locale catalogs." } },
  create(context) {
    const report = (node) => context.report({ node, messageId: "literal" });
    return {
      JSXText(node) {
        if (node.value.trim()) report(node);
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === "JSXElement" || node.parent.type === "JSXFragment")
          checkExpression(node.expression, report);
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const { name } = node.name;
        if (!copyProps.has(name) && !(name === "value" && isButtonInput(node.parent))) return;
        const { value } = node;
        checkExpression(
          value?.type === "JSXExpressionContainer" ? value.expression : value,
          report,
        );
      },
    };
  },
};
