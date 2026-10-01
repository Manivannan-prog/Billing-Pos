import { useEffect } from "react";
import Icon from "./Icon";

export { Icon };

const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- Button -- */

const BUTTON_VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
  accent: "bg-accent text-[#3b2a16] hover:brightness-95",
};

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Card -- */

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={cx(
        "rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_0_rgb(31_36_33/0.04),0_1px_3px_0_rgb(31_36_33/0.04)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-semibold leading-tight text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- StatCard -- */

export function StatCard({ label, value, hint, tone = "default", icon }) {
  const tones = {
    default: "text-text",
    primary: "text-primary",
    accent: "text-[#8a6534]",
    danger: "text-danger",
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={cx("tabular mt-3 font-display text-[26px] font-semibold leading-none", tones[tone])}>
        {value}
      </p>
      {hint && <p className="mt-2 text-[13px] text-text-muted">{hint}</p>}
    </Card>
  );
}

/* ----------------------------------------------------------------- Badge -- */

const BADGE_TONES = {
  neutral: "bg-surface-2 text-text-muted border-border",
  primary: "bg-primary-tint text-primary border-primary/20",
  success: "bg-success-tint text-success border-success/20",
  warning: "bg-warning-tint text-warning border-warning/20",
  danger: "bg-danger-tint text-danger border-danger/20",
  accent: "bg-accent-tint text-[#8a6534] border-accent/30",
};

export function Badge({ tone = "neutral", children, className }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Field -- */

const CONTROL =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted/70 " +
  "focus:border-primary/40 focus:outline-2 focus:outline-offset-0 focus:outline-primary/20 disabled:bg-surface-2";

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-text">{label}</span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[12px] text-text-muted">{hint}</span>
      )}
    </label>
  );
}

export function Input({ className, ...rest }) {
  return <input className={cx(CONTROL, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cx(CONTROL, "py-2", className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <div className="relative">
      <select className={cx(CONTROL, "h-10 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- Modal -- */

export function Modal({ open, onClose, title, subtitle, children, footer, width = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="print-hidden fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-[#1f2421]/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_25px_-5px_rgb(31_36_33/0.15)]",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Alert -- */

const ALERT_TONES = {
  danger: "border-danger/25 bg-danger-tint text-danger",
  success: "border-success/25 bg-success-tint text-success",
  warning: "border-warning/25 bg-warning-tint text-warning",
  info: "border-border bg-surface-2 text-text-muted",
};

export function Alert({ tone = "info", icon = "alert", children, action, className }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px]",
        ALERT_TONES[tone],
        className,
      )}
    >
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ EmptyState -- */

export function EmptyState({ icon = "receipt", title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="font-display text-[15px] font-semibold text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }) {
  return (
    <span
      className={cx("inline-block animate-spin rounded-full border-2 border-border border-t-primary", className)}
    />
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-[26px] font-semibold leading-tight text-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
