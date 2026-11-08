import type { ReactNode } from "react";

/** Page header: title, one-line intro and at most one primary action on the end side. */
export function PageHeader({
  title,
  intro,
  titleId,
  action,
}: {
  title: string;
  intro?: string;
  titleId: string;
  action?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-text">
        <h1 id={titleId} className="ui-page-title">
          {title}
        </h1>
        {intro !== undefined && <p className="ui-page-intro">{intro}</p>}
      </div>
      {action !== undefined && <div className="ui-page-header-action">{action}</div>}
    </header>
  );
}

/** A surface card with an optional heading row (title + quiet actions). */
export function Card({
  title,
  titleId,
  actions,
  children,
  tone = "default",
}: {
  title?: string;
  titleId?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "default" | "sunken";
}) {
  return (
    <section className={`ui-card ui-card-${tone}`} aria-labelledby={titleId}>
      {title !== undefined && (
        <div className="ui-card-head">
          <h2 id={titleId} className="ui-card-title">
            {title}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** DESIGN §10 KpiTile: a label and one large tabular number. */
export function KpiTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="ui-kpi">
      <span className="ui-kpi-label">{label}</span>
      <span className="ui-kpi-value">{value}</span>
      {detail !== undefined && <span className="ui-kpi-detail">{detail}</span>}
    </div>
  );
}

/** Two-column form grid on wide screens, one column on phones. */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="ui-form-grid">{children}</div>;
}

/** Bottom action bar: secondary actions on the start side, one primary at the end. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="ui-action-bar">{children}</div>;
}
