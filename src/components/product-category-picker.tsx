import type { ProductCategory } from "@/lib/catalog-selection";
export function ProductCategoryPicker({
  categories,
  value,
  onChange,
  disabled = false,
}: {
  categories: ProductCategory[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id="product-category"
      aria-label="Categoria do produto"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      <option value="">
        {categories.length ? "Selecione uma categoria" : "Nenhuma categoria cadastrada"}
      </option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.nome}
        </option>
      ))}
    </select>
  );
}
