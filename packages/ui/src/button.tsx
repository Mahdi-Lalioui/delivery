import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "danger-ghost";
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  isLoading?: boolean;
  isBlock?: boolean;
  children: ReactNode;
};

function ButtonIcon({ icon, isLoading }: { icon: IconName | undefined; isLoading: boolean }) {
  if (isLoading) return <span className="ui-spinner" aria-hidden="true" />;
  return icon === undefined ? null : <Icon name={icon} />;
}

/** DESIGN §10 Button: primary/secondary/ghost/destructive, 40/48/52 px, press feedback, loading. */
function buttonClass({
  variant,
  size,
  isBlock,
}: {
  variant: ButtonVariant | undefined;
  size: Props["size"] | undefined;
  isBlock: boolean | undefined;
}) {
  const block = isBlock === true ? " ui-button-block" : "";
  return `ui-button ui-button-${variant ?? "secondary"} ui-button-${size ?? "md"}${block}`;
}

export function Button(props: Props) {
  const { variant, size, icon, isLoading, isBlock, children, type, disabled, ...rest } = props;
  const isBusy = isLoading === true;
  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={buttonClass({ variant, size, isBlock })}
      disabled={isBusy || disabled}
      aria-busy={isBusy || undefined}
    >
      <ButtonIcon icon={icon} isLoading={isBusy} />
      <span>{children}</span>
    </button>
  );
}

/** A quiet square button for secondary actions; the label is required for screen readers. */
export function IconButton({
  icon,
  label,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
  icon: IconName;
  label: string;
}) {
  return (
    <button type="button" {...rest} className="ui-icon-button" aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}

/** A link styled as a button (for navigation and downloads). */
export function ButtonLink({
  variant = "secondary",
  icon,
  href,
  children,
  download,
}: {
  variant?: ButtonVariant;
  icon?: IconName;
  href: string;
  children: ReactNode;
  download?: boolean;
}) {
  return (
    <a className={`ui-button ui-button-${variant} ui-button-md`} href={href} download={download}>
      {icon !== undefined && <Icon name={icon} />}
      <span>{children}</span>
    </a>
  );
}
