import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type FieldFrame = {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  width?: "money" | "short" | "full" | undefined;
};

function describedBy(id: string, frame: FieldFrame): string | undefined {
  const ids = [
    frame.hint !== undefined ? `${id}-hint` : "",
    frame.error !== undefined ? `${id}-error` : "",
  ].filter(Boolean);
  return ids.length === 0 ? undefined : ids.join(" ");
}

function Frame({ id, frame, children }: { id: string; frame: FieldFrame; children: ReactNode }) {
  return (
    <div
      className={`ui-field ui-field-${frame.width ?? "full"}`}
      data-invalid={frame.error !== undefined || undefined}
    >
      <label className="ui-field-label" htmlFor={id}>
        {frame.label}
      </label>
      {children}
      {frame.hint !== undefined && (
        <p id={`${id}-hint`} className="ui-field-hint">
          {frame.hint}
        </p>
      )}
      {frame.error !== undefined && (
        <p id={`${id}-error`} className="ui-field-error" role="alert">
          {frame.error}
        </p>
      )}
    </div>
  );
}

type TextProps = FieldFrame &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> & {
    prefix?: string;
    suffix?: string;
  };

/** DESIGN §10 TextField with optional prefix/suffix inside the box (e.g. "DA"). */
export function TextField({ label, hint, error, width, prefix, suffix, ...input }: TextProps) {
  const id = useId();
  return (
    <Frame id={id} frame={{ label, hint, error, width }}>
      <span className="ui-input-box">
        {prefix !== undefined && (
          <span className="ui-input-affix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          {...input}
          id={id}
          className="ui-input"
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy(id, { label, hint, error })}
        />
        {suffix !== undefined && (
          <span className="ui-input-affix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </span>
    </Frame>
  );
}

/** Money in whole dinars: ~160 px wide with the unit inside the field (DESIGN §1 "1 450 DA"). */
export function MoneyField(
  props: Omit<TextProps, "width" | "suffix" | "inputMode"> & { unit: string },
) {
  const { unit, ...rest } = props;
  return <TextField {...rest} width="money" suffix={unit} inputMode="numeric" dir="ltr" />;
}

export function TextAreaField({
  label,
  hint,
  error,
  ...area
}: FieldFrame & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id">) {
  const id = useId();
  return (
    <Frame id={id} frame={{ label, hint, error }}>
      <textarea
        {...area}
        id={id}
        className="ui-input ui-textarea"
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
      />
    </Frame>
  );
}

/** A styled native select: keeps the platform picker on phones, looks like the rest of the kit. */
export function SelectField({
  label,
  hint,
  error,
  width,
  children,
  ...select
}: FieldFrame & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "id">) {
  const id = useId();
  return (
    <Frame id={id} frame={{ label, hint, error, width }}>
      <span className="ui-select-box">
        <select
          {...select}
          id={id}
          className="ui-input ui-select"
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy(id, { label, hint, error })}
        >
          {children}
        </select>
      </span>
    </Frame>
  );
}
