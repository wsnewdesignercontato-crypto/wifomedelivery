import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeProductVolumeUnit, type ProductField } from "@/lib/product-details";
export function ProductSpecificFields({
  fields,
  values,
  onChange,
  disabled = false,
}: {
  fields: ProductField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
}) {
  if (!fields.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-primary/15 bg-primary/[0.025] p-4">
      <h3 className="text-sm font-semibold">
        Detalhes desta categoria{" "}
        <span className="font-normal text-muted-foreground">· opcionais</span>
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={"detail-" + field.key} className="text-xs">
              {field.label}
              {field.suffix
                ? " (" +
                  (field.key === "volume_ml" ? values.volume_unit || "ml" : field.suffix) +
                  ")"
                : ""}
            </Label>
            {field.options ? (
              <select
                id={"detail-" + field.key}
                value={values[field.key] ?? (field.key === "volume_unit" ? "ml" : "")}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    field.key === "volume_unit"
                      ? changeProductVolumeUnit(values, event.target.value)
                      : { ...values, [field.key]: event.target.value },
                  )
                }
                className="h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {field.key !== "volume_unit" && <option value="">Selecione</option>}
                {values[field.key] && !field.options.includes(values[field.key]) && (
                  <option value={values[field.key]}>{values[field.key]}</option>
                )}
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={"detail-" + field.key}
                inputMode={field.numeric ? "decimal" : "text"}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                maxLength={200}
                onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
                disabled={disabled}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
