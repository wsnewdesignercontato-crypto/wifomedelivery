import { detailBadges, readProductDetails } from "@/lib/product-details";
export function ProductDetails({ value }: { value?: string | null }) {
  const { description } = readProductDetails(value);
  const details = detailBadges(value);
  return (
    <div className="space-y-2">
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {!!details.length && (
        <dl className="flex flex-wrap gap-1.5">
          {details.map((item) => (
            <div key={item.key} className="rounded-lg bg-muted/50 px-2 py-1 text-xs">
              <dt className="inline text-muted-foreground">{item.label}: </dt>
              <dd className="inline font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
