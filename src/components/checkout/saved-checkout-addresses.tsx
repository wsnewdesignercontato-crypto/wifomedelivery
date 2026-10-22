import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

type Address = {
  id: string;
  label: string;
  rua: string;
  numero: string | null;
  bairro: string | null;
  cidade: string;
  estado: string | null;
  cep: string | null;
};

export function SavedCheckoutAddresses({
  addresses,
  selectedId,
  onSelect,
  coupon,
}: {
  addresses: Address[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  coupon?: string;
}) {
  return (
    <section
      aria-labelledby="checkout-address-heading"
      className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-7"
    >
      <h2
        id="checkout-address-heading"
        className="mb-5 flex items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <MapPin className="h-4 w-4 text-primary" /> Endereço de entrega
      </h2>
      {addresses.length > 1 && (
        <p className="mb-2 text-xs text-muted-foreground">Escolha um dos seus endereços salvos.</p>
      )}
      {addresses.length === 0 && (
        <p className="mb-2 text-sm text-muted-foreground">
          Nenhum endereço cadastrado. Cadastre no perfil para receber seu pedido.
        </p>
      )}
      <div className="space-y-2">
        {addresses.map((address) => (
          <label
            key={address.id}
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm ${selectedId === address.id ? "border-primary bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/10" : "border-border bg-card text-foreground hover:border-primary/40"}`}
          >
            <input
              type="radio"
              name="checkout-address"
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              checked={selectedId === address.id}
              onChange={() => onSelect(address.id)}
            />
            <div>
              <div className="font-semibold">{address.label}</div>
              <div className="text-xs text-muted-foreground">
                {address.rua}
                {address.numero ? `, ${address.numero}` : ""}
                {address.bairro ? ` — ${address.bairro}` : ""}
                <br />
                {address.cidade}
                {address.estado ? `/${address.estado}` : ""}
                {address.cep ? ` · CEP ${address.cep}` : ""}
              </div>
            </div>
          </label>
        ))}
      </div>
      <Link
        to="/cliente/perfil/enderecos"
        search={{ checkout: true, cupom: coupon }}
        className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        {addresses.length ? "Gerenciar endereços no perfil" : "Cadastrar endereço no perfil"}
      </Link>
    </section>
  );
}
