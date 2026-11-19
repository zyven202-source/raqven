import { type ReactNode, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/**
 * A form field: label, control, optional hint, optional error.
 *
 * Every form in the product uses this so label association, hint text and
 * validation messaging are consistent, and so the label is a real `<label>`
 * rather than a div that only looks like one.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  children: ReactNode;
  className?: string | undefined;
  htmlFor?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-negative">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Password input with a real show/hide control and a 44px touch target. */
export function PasswordField({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  label,
  hint,
  error,
  minLength,
  required,
}: {
  id: string;
  name?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  minLength?: number | undefined;
  required?: boolean | undefined;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          className="h-11 pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sunken"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

/**
 * A money input. The currency is a fixed prefix, not part of the value, so the
 * shopkeeper types digits only and the keypad stays numeric.
 */
export function MoneyField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  currency = "KES",
  placeholder = "0",
  autoFocus,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  currency?: string | undefined;
  placeholder?: string | undefined;
  autoFocus?: boolean | undefined;
}) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {currency}
        </span>
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          className="tnum h-11 pl-12"
        />
      </div>
    </Field>
  );
}

/** A quantity input with the unit shown beside it. */
export function QuantityField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  unit,
  placeholder = "0",
  autoFocus,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  placeholder?: string | undefined;
  autoFocus?: boolean | undefined;
}) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          className="tnum h-11 pr-14"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
    </Field>
  );
}

/**
 * A settings row: a title, an explanation in plain language, and a switch.
 * Separated by a hairline rather than boxed in its own card.
 */
export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  title: string;
  description?: string | undefined;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean | undefined;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {title}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
