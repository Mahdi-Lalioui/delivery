"use client";

import {
  Badge,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorState,
  Icon,
  KpiTile,
  Logo,
  LogoMark,
  MoneyField,
  SegmentedControl,
  Skeleton,
  TextField,
  Toggle,
  type IconName,
} from "@zaafran/ui";
import { brand } from "@zaafran/config/brand";
import { useState } from "react";

// The design system at a glance (DESIGN.md): brand, colour, type and every component state.
// Design builds only; the copy is the system's own vocabulary, shown in the gallery's language.

export type SystemCopy = Readonly<
  Record<
    | "brand"
    | "tagline"
    | "colour"
    | "type"
    | "components"
    | "states"
    | "primary"
    | "secondary"
    | "ghost"
    | "danger"
    | "loading"
    | "price"
    | "name"
    | "toggle"
    | "toggleHint"
    | "delivery"
    | "pickup"
    | "all"
    | "open"
    | "new"
    | "promo"
    | "live"
    | "emptyTitle"
    | "emptyBody"
    | "errorTitle"
    | "retry"
    | "orders"
    | "display"
    | "body"
    | "unit"
    | "priceSample"
    | "namePlaceholder",
    string
  >
>;

// Brand palette from docs/SPRINT.md; names and hex are design vocabulary, not UI copy.
const swatches = [
  ["text", "Deep green", "#0B3D2E"],
  ["accent", "Green", "#00A37A"],
  ["mint", "Mint", "#4DE3B4"],
  ["mint-pale", "Pale mint", "#D9FCE7"],
  ["cream", "Cream", "#FFF8E6"],
  ["harissa", "Harissa", "#C2410C"],
] as const;
const icons: readonly IconName[] = [
  "plate",
  "bag",
  "user",
  "heart",
  "star",
  "clock",
  "bike",
  "tag",
  "receipt",
  "qr",
  "calendar",
  "settings",
];

export function SystemShowcase({ copy }: { copy: SystemCopy }) {
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [chip, setChip] = useState("all");
  return (
    <div className="system-showcase">
      <Card title={copy.brand} titleId="system-brand">
        <div className="system-brand-row">
          <Logo height={72} name={brand.name} />
          <LogoMark size={72} label={brand.name} />
        </div>
        <p className="system-tagline">{copy.tagline}</p>
      </Card>
      <Card title={copy.colour} titleId="system-colour">
        <ul className="system-swatches">
          {swatches.map(([token, label, hex]) => (
            <li key={token} className="system-swatch" data-token={token}>
              <span className="system-swatch-chip" />
              <span className="system-swatch-name" lang="en">
                {label}
              </span>
              <code dir="ltr">{hex}</code>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={copy.type} titleId="system-type">
        <p className="system-type-display">{copy.display}</p>
        <p className="system-type-h2">{copy.orders}</p>
        <p>{copy.body}</p>
        <p className="system-type-price">
          <bdi>{copy.priceSample}</bdi>
        </p>
      </Card>
      <Card title={copy.components} titleId="system-components">
        <div className="system-row">
          <Button variant="primary" size="lg" icon="bag">
            {copy.primary}
          </Button>
          <Button variant="secondary">{copy.secondary}</Button>
          <Button variant="ghost" icon="heart">
            {copy.ghost}
          </Button>
          <Button variant="danger-ghost" icon="alert">
            {copy.danger}
          </Button>
          <Button variant="primary" isLoading>
            {copy.loading}
          </Button>
        </div>
        <div className="system-row">
          <SegmentedControl
            legend={copy.delivery}
            isLegendVisible={false}
            name="system-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "delivery", label: copy.delivery, icon: "bike" },
              { value: "pickup", label: copy.pickup, icon: "bag" },
            ]}
          />
          <ChipGroup
            legend={copy.all}
            value={chip}
            onChange={setChip}
            options={[
              { value: "all", label: copy.all },
              { value: "open", label: copy.open },
              { value: "new", label: copy.new },
            ]}
          />
        </div>
        <div className="system-row">
          <Badge tone="success">{copy.open}</Badge>
          <Badge tone="primary">{copy.new}</Badge>
          <Badge tone="harissa">{copy.live}</Badge>
          <Badge tone="warning">{copy.promo}</Badge>
        </div>
        <div className="system-fields">
          <TextField label={copy.name} placeholder={copy.namePlaceholder} />
          <MoneyField label={copy.price} unit={copy.unit} defaultValue={String(1450)} />
          <Toggle label={copy.toggle} description={copy.toggleHint} defaultChecked />
        </div>
        <ul className="system-icons">
          {icons.map((icon) => (
            <li key={icon}>
              <Icon name={icon} size={24} />
            </li>
          ))}
        </ul>
      </Card>
      <Card title={copy.states} titleId="system-states">
        <div className="system-states">
          <KpiTile label={copy.orders} value="412" detail={copy.open} />
          <Skeleton label={copy.loading} lines={3} />
          <EmptyState icon="plate" title={copy.emptyTitle} body={copy.emptyBody} />
          <ErrorState title={copy.errorTitle} retryLabel={copy.retry} onRetry={() => undefined} />
        </div>
      </Card>
    </div>
  );
}
