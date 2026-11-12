"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Icon, type IconName } from "./icons";

export type BadgeTone =
  "neutral" | "success" | "warning" | "danger" | "info" | "primary" | "harissa";
const toneIcons: Partial<Record<BadgeTone, IconName>> = {
  success: "check",
  warning: "clock",
  danger: "alert",
  info: "receipt",
};

/** DESIGN §10 Badge. Never colour alone (§3.4): it always carries text, and an icon for states. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const icon = toneIcons[tone];
  return (
    <span className={`ui-badge ui-badge-${tone}`}>
      {icon !== undefined && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/** DESIGN §10 Skeleton: warm shimmer, static when reduced motion is on. */
export function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="ui-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="ui-skeleton-line" data-line={index % 3} />
      ))}
    </div>
  );
}

/** The state's picture: an app-supplied illustration when given, otherwise the icon disc. */
function StateMark({ art, icon }: { art: ReactNode; icon: IconName }) {
  if (art !== undefined) return <span className="ui-state-art">{art}</span>;
  return (
    <span className="ui-state-icon">
      <Icon name={icon} size={28} />
    </span>
  );
}

export function EmptyState({
  icon = "plate",
  art,
  title,
  body,
  action,
}: {
  icon?: IconName;
  art?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state">
      <StateMark art={art} icon={icon} />
      <p className="ui-state-title">{title}</p>
      {body !== undefined && <p className="ui-state-body">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  art,
  title,
  body,
  retryLabel,
  onRetry,
}: {
  art?: ReactNode;
  title: string;
  body?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-state ui-state-error" role="alert">
      <StateMark art={art} icon="alert" />
      <p className="ui-state-title">{title}</p>
      {body !== undefined && <p className="ui-state-body">{body}</p>}
      {onRetry !== undefined && retryLabel !== undefined && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

type Toast = { id: number; tone: "success" | "danger"; message: string };
type ToastApi = { show: (message: string, tone?: Toast["tone"]) => void };

const ToastContext = createContext<ToastApi>({ show: () => undefined });
const toastMs = 4000;

/** DESIGN §10 Toast: top of the screen, auto-dismiss after 4 s, announced politely. */
export function ToastProvider({
  children,
  closeLabel,
}: {
  children: ReactNode;
  closeLabel: string;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Toast["tone"] = "success") => {
    setToasts((current) => [
      ...current.slice(-2),
      { id: Date.now() + Math.random(), tone, message },
    ]);
  }, []);
  const dismiss = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} closeLabel={closeLabel} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  closeLabel,
  onDismiss,
}: {
  toast: Toast;
  closeLabel: string;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toastMs);
    return () => {
      clearTimeout(timer);
    };
  }, [toast.id, onDismiss]);
  return (
    <div className={`ui-toast ui-toast-${toast.tone}`}>
      <Icon name={toast.tone === "success" ? "check" : "alert"} />
      <span>{toast.message}</span>
      <button
        type="button"
        className="ui-icon-button"
        aria-label={closeLabel}
        onClick={() => {
          onDismiss(toast.id);
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
