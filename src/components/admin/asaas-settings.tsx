import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAsaasSettings,
  saveAsaasSettings,
  testAsaasConnection,
  registerAsaasWebhook,
} from "@/lib/admin-asaas.functions";
import type { AsaasEnvironment, AsaasStatus } from "@/lib/asaas-config";

type Action = "save" | "test" | "register";
const settingsKey = (environment: AsaasEnvironment) => ["admin-asaas-settings", environment];
const dateLabel = (value: string | null) => {
  if (!value) return "Ainda não recebido";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");
};

export function AsaasSettings() {
  const load = useServerFn(getAsaasSettings);
  const save = useServerFn(saveAsaasSettings);
  const test = useServerFn(testAsaasConnection);
  const register = useServerFn(registerAsaasWebhook);
  const qc = useQueryClient();
  const [environment, setEnvironment] = useState<AsaasEnvironment>("sandbox");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const busyRef = useRef(false);
  const epoch = useRef(0);
  const alive = useRef(true);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: settingsKey(environment),
    queryFn: () => load({ data: { environment } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = data?.environment === environment ? data : undefined;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setNotificationEmail(status?.notificationEmail ?? "");
  }, [environment, status?.notificationEmail, status?.revision]);

  const dirty =
    !!apiKey.trim() ||
    !!webhookToken.trim() ||
    notificationEmail.trim() !== (status?.notificationEmail ?? "");
  const canTest = !!status?.configured && !dirty && !busy;
  const canRegister = canTest && !!status?.tested;

  function changeEnvironment(value: string) {
    if (value !== "sandbox" && value !== "production") return;
    epoch.current++;
    busyRef.current = false;
    setBusy(null);
    setApiKey("");
    setWebhookToken("");
    setNotificationEmail("");
    setEnvironment(value);
  }

  async function runAction(
    action: Action,
    operation: () => Promise<{ status: AsaasStatus; message: string }>,
  ) {
    if (busyRef.current || !alive.current) return;
    busyRef.current = true;
    setBusy(action);
    const request = epoch.current;
    const current = () => alive.current && epoch.current === request;
    try {
      const result = await operation();
      if (!current() || result.status.environment !== environment) return;
      qc.setQueryData(settingsKey(environment), result.status);
      if (action === "save") {
        setApiKey("");
        setWebhookToken("");
      }
      toast.success(result.message);
    } catch {
      if (!current()) return;
      const messages: Record<Action, string> = {
        save: "Não foi possível salvar a configuração do Asaas.",
        test: "Não foi possível testar a conexão. Confira a chave e o ambiente selecionado.",
        register: "Não foi possível registrar o webhook. Teste a conexão e tente novamente.",
      };
      toast.error(messages[action]);
    } finally {
      if (current()) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status || !dirty || busyRef.current) return;
    if (!status.configured && !apiKey.trim()) {
      toast.error("Cole a chave API deste ambiente antes de salvar.");
      return;
    }
    await runAction("save", async () => ({
      status: await save({
        data: {
          environment,
          notificationEmail: notificationEmail.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(webhookToken.trim() ? { webhookToken: webhookToken.trim() } : {}),
        },
      }),
      message: "Configuração salva. Teste a conexão deste ambiente antes de registrar o webhook.",
    }));
  }
  async function testConnection() {
    if (!canTest) return;
    await runAction("test", () => test({ data: { environment } }));
  }
  async function registerWebhook() {
    if (!canRegister) return;
    await runAction("register", () => register({ data: { environment } }));
  }

  return (
    <section
      aria-labelledby="asaas-title"
      className="max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <CreditCard className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="asaas-title" className="text-lg font-semibold">
            Conexão de pagamentos · Asaas
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure as credenciais e o recebimento de eventos de pagamento.
          </p>
        </div>
      </div>
      <div>
        <Label htmlFor="asaas-environment">Ambiente</Label>
        <select
          id="asaas-environment"
          value={environment}
          onChange={(event) => changeEnvironment(event.target.value)}
          className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="sandbox">Sandbox · testes</option>
          <option value="production">Produção</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Sandbox e Produção usam credenciais separadas. Comece pelo Sandbox.
        </p>
      </div>
      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando configuração…
        </p>
      ) : error || !status ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>Não foi possível carregar a configuração deste ambiente.</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <form onSubmit={saveConfig} className="space-y-4">
          <div role="status" className="space-y-1 rounded-xl border border-border p-4 text-sm">
            <p className="font-medium">
              {status.tested
                ? "Conexão verificada"
                : status.configured
                  ? "Chave salva · teste pendente"
                  : "Asaas ainda não configurado neste ambiente"}
            </p>
            {status.testedAt && <p>Último teste: {dateLabel(status.testedAt)}</p>}
            <p>
              {status.webhookConfigured ? "Webhook registrado" : "Webhook ainda não registrado"}
            </p>
            <p className="text-muted-foreground">
              Último webhook recebido: {dateLabel(status.lastWebhookAt)}
            </p>
          </div>
          <div>
            <Label htmlFor="asaas-notification-email">E-mail de notificações</Label>
            <Input
              id="asaas-notification-email"
              type="email"
              value={notificationEmail}
              onChange={(event) => setNotificationEmail(event.target.value)}
              autoComplete="email"
              maxLength={254}
              required
              disabled={!!busy}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="asaas-api-key">Chave API do Asaas</Label>
            <Input
              id="asaas-api-key"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                status.configured
                  ? "Chave salva. Deixe em branco para manter."
                  : "Cole a chave deste ambiente"
              }
              disabled={!!busy}
              aria-describedby="asaas-secret-help"
              className="mt-1.5"
            />
            <p id="asaas-secret-help" className="mt-1 text-xs text-muted-foreground">
              A chave salva não é exibida. Cole a chave somente neste campo e nunca a compartilhe
              pelo chat.
            </p>
          </div>
          <div>
            <Label htmlFor="asaas-webhook-token">Token do webhook · opcional</Label>
            <Input
              id="asaas-webhook-token"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={webhookToken}
              onChange={(event) => setWebhookToken(event.target.value)}
              disabled={!!busy}
              aria-describedby="asaas-token-help"
              placeholder="Deixe em branco para manter ou gerar automaticamente"
              className="mt-1.5"
            />
            <p id="asaas-token-help" className="mt-1 text-xs text-muted-foreground">
              Em branco, o servidor mantém o token existente ou gera um token seguro. Ele não é
              exibido após salvar.
            </p>
          </div>
          <div>
            <Label htmlFor="asaas-webhook-url">URL do webhook deste ambiente</Label>
            <Input id="asaas-webhook-url" value={status.webhookUrl} readOnly className="mt-1.5" />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            As credenciais são guardadas criptografadas e usadas somente pelo servidor.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!!busy || !dirty}>
              {busy === "save" ? "Salvando…" : "Salvar configuração"}
            </Button>
            <Button type="button" variant="outline" onClick={testConnection} disabled={!canTest}>
              {busy === "test" ? "Testando…" : "Testar conexão"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={registerWebhook}
              disabled={!canRegister}
            >
              {busy === "register" ? "Registrando…" : "Registrar/atualizar webhook"}
            </Button>
          </div>
          {dirty && (
            <p className="text-xs text-muted-foreground">
              Salve as alterações antes de testar ou registrar o webhook.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            O teste apenas consulta a conexão. O webhook só é registrado quando você clicar no botão
            correspondente. Esta configuração não ativa cobranças no checkout.
          </p>
        </form>
      )}
    </section>
  );
}
