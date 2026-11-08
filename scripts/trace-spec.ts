import ts from "typescript";

const declaration = /^(?:-\s+\*\*([A-Z][A-Z0-9]*-\d{2})\*\*|\|\s*(NFR-\d{2})\s*\|)/;
const frameworks = new Set(["vitest", "@playwright/test", "node:test", "@jest/globals"]);
const testModifiers = new Set(["each", "concurrent"]);
const suiteModifiers = new Set(["describe", "concurrent", "parallel", "serial", "sequential"]);
type Binding = "test" | "suite";
const namedBindings: ReadonlyMap<string, Binding> = new Map([
  ["test", "test"],
  ["it", "test"],
  ["describe", "suite"],
  ["suite", "suite"],
]);

export function getSpecIds(spec: string): string[] {
  const ids = new Set<string>();
  for (const line of spec.split(/\r?\n/)) {
    const [, bulletId, tableId] = declaration.exec(line) ?? [];
    const id = bulletId ?? tableId;
    if (!id) continue;
    if (ids.has(id)) throw new Error("Duplicate SPEC acceptance ID: " + id);
    ids.add(id);
  }
  if (ids.size === 0) throw new Error("SPEC declares no acceptance IDs.");
  return [...ids];
}

function getCallPath(expression: ts.Expression): string[] {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    return [...getCallPath(expression.expression), expression.name.text];
  }
  if (ts.isCallExpression(expression)) return getCallPath(expression.expression);
  return [];
}

function readBindings(file: ts.SourceFile): ReadonlyMap<string, Binding> {
  const bindings = new Map<string, Binding>();
  for (const node of file.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (!frameworks.has(node.moduleSpecifier.text)) continue;
    const clause = node.importClause;
    if (!clause || clause.phaseModifier !== undefined) continue;
    if (clause.name && node.moduleSpecifier.text === "node:test") {
      bindings.set(clause.name.text, "test");
    }
    addNamedBindings(clause.namedBindings, bindings);
  }
  return bindings;
}

function addNamedBindings(
  names: ts.NamedImportBindings | undefined,
  bindings: Map<string, Binding>,
): void {
  if (!names || !ts.isNamedImports(names)) return;
  for (const named of names.elements) {
    const kind = namedBindings.get(named.propertyName?.text ?? named.name.text);
    if (kind && !named.isTypeOnly) bindings.set(named.name.text, kind);
  }
}

function readCallback(node: ts.CallExpression): ts.ConciseBody | undefined {
  const callback = node.arguments.at(-1);
  if (!callback || node.arguments.length !== 2) return;
  if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) return callback.body;
}

function readTitle(node: ts.CallExpression): string {
  const title = node.arguments[0];
  return title && ts.isStringLiteralLike(title) ? title.text : "";
}

function hasSkipDirective(body: ts.ConciseBody, bindings: ReadonlyMap<string, Binding>): boolean {
  function visit(node: ts.Node): boolean | undefined {
    if (ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const [root, modifier] = getCallPath(node.expression);
      const isTest = root && bindings.get(root) === "test";
      if (isTest && (modifier === "skip" || modifier === "fixme") && !readTitle(node)) {
        return true;
      }
    }
    return ts.forEachChild(node, visit);
  }
  return Boolean(visit(body));
}

function hasCases(node: ts.CallExpression): boolean {
  if (!ts.isCallExpression(node.expression)) return false;
  const cases = node.expression.arguments[0];
  return (
    !!cases &&
    ts.isArrayLiteralExpression(cases) &&
    cases.elements.length > 0 &&
    cases.elements.every((item) => !ts.isSpreadElement(item) && !ts.isOmittedExpression(item))
  );
}

function readRegistration(statement: ts.Statement): ts.CallExpression | undefined {
  if (!ts.isExpressionStatement(statement)) return;
  const { expression } = statement;
  const call = ts.isVoidExpression(expression) ? expression.expression : expression;
  if (ts.isCallExpression(call)) return call;
}

function collectTitles(
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, Binding>,
  ids: Set<string>,
): void {
  for (const statement of statements) {
    const call = readRegistration(statement);
    if (!call) continue;
    const [root, ...modifiers] = getCallPath(call.expression);
    const kind = root ? bindings.get(root) : undefined;
    if (!kind) continue;
    const body = readCallback(call);
    if (!body || hasSkipDirective(body, bindings)) continue;
    const isSuite = kind === "suite" || modifiers[0] === "describe";
    if (isSuite) collectSuite({ body, modifiers, bindings, ids });
    else collectTestIds(call, modifiers, ids);
  }
}

interface SuiteRegistration {
  readonly body: ts.ConciseBody;
  readonly modifiers: readonly string[];
  readonly bindings: ReadonlyMap<string, Binding>;
  readonly ids: Set<string>;
}

function collectSuite({ body, modifiers, bindings, ids }: SuiteRegistration): void {
  if (ts.isBlock(body) && modifiers.every((modifier) => suiteModifiers.has(modifier))) {
    collectTitles(body.statements, scopeBindings(body.statements, bindings), ids);
  }
}

function scopeBindings(
  statements: readonly ts.Statement[],
  bindings: ReadonlyMap<string, Binding>,
): ReadonlyMap<string, Binding> {
  const scoped = new Map(bindings);
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        removeBinding(declaration.name, scoped);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      scoped.delete(statement.name.text);
    }
  }
  return scoped;
}

function removeBinding(name: ts.BindingName, bindings: Map<string, Binding>): void {
  if (ts.isIdentifier(name)) {
    bindings.delete(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) removeBinding(element.name, bindings);
  }
}

function collectTestIds(
  call: ts.CallExpression,
  modifiers: readonly string[],
  ids: Set<string>,
): void {
  if (!modifiers.every((modifier) => testModifiers.has(modifier))) return;
  if (modifiers.includes("each") && !hasCases(call)) return;
  for (const [, id] of readTitle(call).matchAll(/\[([A-Z][A-Z0-9]*-\d{2})\]/g)) {
    if (id) ids.add(id);
  }
}

export function getTitleIds(source: string, filename = "test.ts"): string[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const ids = new Set<string>();
  collectTitles(file.statements, readBindings(file), ids);
  return [...ids];
}

function checkOwnership(
  specIds: ReadonlySet<string>,
  ownership: ReadonlyMap<string, number>,
): void {
  for (const [id, milestone] of ownership) {
    if (!specIds.has(id)) throw new Error("Ownership refers to undeclared acceptance ID: " + id);
    if (!Number.isInteger(milestone) || milestone < 0 || milestone > 12) {
      throw new Error("Invalid milestone for acceptance ID: " + id);
    }
  }
  for (const id of specIds) {
    if (!ownership.has(id)) throw new Error("Missing milestone for acceptance ID: " + id);
  }
}

interface TraceInput {
  readonly specIds: readonly string[];
  readonly titleIds: readonly string[];
  readonly ownership: ReadonlyMap<string, number>;
  readonly through: number;
}

export function checkTrace({ specIds, titleIds, ownership, through }: TraceInput): {
  missing: string[];
  pending: string[];
} {
  const declared = new Set(specIds);
  checkOwnership(declared, ownership);
  for (const id of titleIds) {
    if (!declared.has(id)) throw new Error("Test cites undeclared acceptance ID: " + id);
  }
  const tested = new Set(titleIds);
  const missing: string[] = [];
  const pending: string[] = [];
  for (const [id, milestone] of ownership) {
    if (milestone > through) pending.push(id);
    else if (!tested.has(id)) missing.push(id);
  }
  return { missing: missing.sort(), pending: pending.sort() };
}
