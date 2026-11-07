import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
const filePath = "apps/web/src/components/home.tsx";

void test("UI lint rejects literal JSX copy and permits translated copy and identifiers", async () => {
  const cases = [
    {
      source: `export const Example = ({ ready }: { ready: boolean }) =>
        <><p>Menu du jour</p><p>{"طلب"}</p><input placeholder="Search" />
        <button aria-label={ready ? "Ready" : "Waiting"} />
        <p>{ready && \`Ready now\`}</p><input type="submit" value="Place order" />
        <div role="textbox" aria-placeholder="Search here" />
        <input type="SUBMIT" value="Place order" />
        <input type={\`reset\`} value="Reset" /></>;`,
      expected: 10,
    },
    {
      source: `export const Example = ({ translate }: { translate: (key: string) => string }) =>
        <><p className="section" id="menu">{translate("title")}</p>
        <a href="/menu" aria-current="page">{translate("openMenu")}</a>
        <input placeholder={translate("search")} /><img src="/logo.svg" alt="" />
        <select><option value="delivery">{translate("delivery")}</option></select></>;`,
      expected: 0,
    },
  ];

  for (const { source, expected } of cases) {
    const [result] = await eslint.lintText(source, { filePath });
    assert.ok(result);
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.equal(result.messages.length, expected, JSON.stringify(result.messages));
    assert.ok(result.messages.every(({ ruleId }) => ruleId === "zaafran/no-ui-literal"));
  }
});
