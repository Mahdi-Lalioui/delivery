import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ChipGroup,
  EmptyState,
  ErrorState,
  FormGrid,
  IconButton,
  KpiTile,
  MoneyField,
  PageHeader,
  SegmentedControl,
  SelectField,
  Skeleton,
  TextAreaField,
  TextField,
  ToastProvider,
  Toggle,
  ActionBar,
} from "../src/index";

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

test("[UI] buttons expose variants, sizes, loading and accessible names", () => {
  expect(
    html(
      <Button variant="primary" size="lg">
        Save
      </Button>,
    ),
  ).toContain('class="ui-button ui-button-primary ui-button-lg"');
  const loading = html(<Button isLoading>Save</Button>);
  expect(loading).toContain('aria-busy="true"');
  expect(loading).toContain("disabled");
  expect(html(<IconButton icon="close" label="Close" />)).toContain('aria-label="Close"');
  expect(
    html(
      <ButtonLink href="/x.pdf" download icon="download">
        PDF
      </ButtonLink>,
    ),
  ).toContain("download");
});

test("[UI] fields label their inputs, show hints and errors, and keep the unit inside", () => {
  const money = html(<MoneyField label="Price" unit="DA" error="Too low" defaultValue="1450" />);
  expect(money).toContain("ui-field-money");
  expect(money).toContain('aria-invalid="true"');
  expect(money).toMatch(/aria-describedby="[^"]+-error"/);
  expect(money).toContain(">DA<");
  expect(money).toContain('inputMode="numeric"');
  expect(html(<TextField label="Name" hint="Visible to customers" />)).toMatch(
    /aria-describedby="[^"]+-hint"/,
  );
  expect(html(<TextAreaField label="Note" />)).toContain("<textarea");
  expect(
    html(
      <SelectField label="Invoice">
        <option>A</option>
      </SelectField>,
    ),
  ).toContain("ui-select");
});

test("[UI] toggles are switches and segmented controls are radio groups", () => {
  const toggle = html(<Toggle label="Online payment" description="Chargily" defaultChecked />);
  expect(toggle).toContain('role="switch"');
  expect(toggle).toContain("checked");
  const segmented = html(
    <SegmentedControl
      legend="Method"
      name="method"
      options={[
        { value: "ccp", label: "CCP" },
        { value: "bm", label: "BaridiMob", icon: "card" },
      ]}
      defaultValue="ccp"
    />,
  );
  expect(segmented.match(/type="radio"/g)).toHaveLength(2);
  expect(segmented).toContain("<legend");
  const chips = html(
    <ChipGroup
      legend="Stars"
      options={[{ value: "all", label: "All" }]}
      value="all"
      onChange={() => undefined}
    />,
  );
  expect(chips).toContain("ui-chip");
});

test("[UI] states and badges always carry text", () => {
  expect(html(<Badge tone="warning">Pending</Badge>)).toContain("Pending");
  expect(html(<Badge tone="success">Paid</Badge>)).toContain("<svg");
  expect(html(<Skeleton label="Loading" lines={2} />)).toContain('aria-label="Loading"');
  expect(html(<EmptyState title="No invoices" body="They appear here." />)).toContain(
    "No invoices",
  );
  expect(
    html(<ErrorState title="Failed" retryLabel="Retry" onRetry={() => undefined} />),
  ).toContain("Retry");
});

test("[UI] layout pieces render their slots", () => {
  const page = html(
    <ToastProvider closeLabel="Close">
      <PageHeader title="Billing" titleId="t" intro="Intro" action={<Button>Act</Button>} />
      <Card title="Invoices" titleId="c">
        <FormGrid>
          <KpiTile label="Total" value="5 000 DA" detail="This month" />
        </FormGrid>
        <ActionBar>
          <Button>Cancel</Button>
        </ActionBar>
      </Card>
    </ToastProvider>,
  );
  expect(page).toContain('id="t"');
  expect(page).toContain("ui-kpi-value");
  expect(page).toContain('aria-live="polite"');
});
