import { Check, X } from "lucide-react";
import {
  passwordRules,
  passwordScore,
  passwordStrengthLabel,
} from "@/lib/password-strength";

const toneClass = {
  weak: "bg-destructive",
  medium: "bg-amber-500",
  strong: "bg-emerald-500",
} as const;

const toneText = {
  weak: "text-destructive",
  medium: "text-amber-500",
  strong: "text-emerald-500",
} as const;

export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  const { label, tone } = passwordStrengthLabel(score);
  const pct = value.length === 0 ? 0 : Math.max(8, (score / passwordRules.length) * 100);

  return (
    <div className="space-y-2 pt-1">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Força da senha"
        aria-valuemin={0}
        aria-valuemax={passwordRules.length}
        aria-valuenow={score}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${value ? toneClass[tone] : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {value.length > 0 && (
        <p className={`text-xs font-semibold ${toneText[tone]}`}>Força: {label}</p>
      )}
      <ul className="grid gap-1">
        {passwordRules.map((rule) => {
          const ok = rule.test(value);
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-500" : "text-muted-foreground"}`}
            >
              {ok ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 shrink-0 opacity-60" />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
