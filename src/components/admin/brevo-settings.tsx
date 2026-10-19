import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getBrevoSettings,
  saveBrevoSettings,
  testBrevoConnection,
} from "@/lib/admin-brevo.functions";
import { validateBrevoSettings } from "@/lib/brevo-config";
import type { BrevoStatus } from "@/lib/brevo-config";

const queryKey = ["admin-brevo-settings"];

export function BrevoSettings() {
  const load = useServerFn(getBrevoSettings);
  const save = useServerFn(saveBrevoSettings);
  const test = useServerFn(testBrevoConnection);
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: () => load(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [senderName, setSenderName] = useState("PedeTrem");
  const [senderEmail, setSenderEmail] = useState("wsnewdesignercontato@gmail.com");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  useEffect(() => {
    if (!data) return;
    setSenderName(data.senderName);
    setSenderEmail(data.senderEmail);
  }, [data]);

  const dirty = !!apiKey || senderName !== data?.senderName || senderEmail !== data?.senderEmail;
  function updateStatus(status: BrevoStatus) {
    qc.setQueryData(queryKey, status);
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    try {
      const input = validateBrevoSettings({ senderName, senderEmail, apiKey });
      if (!data?.configured && !input.apiKey)
        throw new Error("Cole sua chave API da Brevo antes de salvar.");
      const status = await save({ data: input });
      setApiKey("");
      updateStatus(status);
      toast.success("Configuração salva. Envie um teste para verificar a conexão.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const result = await test();
      updateStatus(result.status);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o teste.");
      void refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="brevo-title"
      className="w-full min-w-0 space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Mail className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="brevo-title" className="text-lg font-semibold">
            Integrações · Brevo
          </h2>
          <p className="text-sm text-muted-foreground">
            E-mails de cadastro e recuperação de senha.
          </p>
        </div>
      </div>
      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando configuração…
        </p>
      ) : error ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>Não foi possível carregar a configuração de e-mails.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <form onSubmit={saveConfig} className="grid items-start gap-6 xl:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <div
              role="status"
              className="space-y-1 rounded-xl border border-border bg-background/50 p-4 text-sm"
            >
              <p className="font-medium">
                {data?.tested
                  ? "Envio de teste aceito pela Brevo"
                  : data?.configured
                    ? "Chave salva · teste pendente"
                    : "Brevo ainda não configurada"}
              </p>
              <p className="text-muted-foreground">
                {data?.tested && data.authHookReady
                  ? "Envio automático de autenticação preparado."
                  : "Envio automático: ativação pendente. Configure e teste a conexão primeiro."}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Verifique esse remetente na Brevo. Sem domínio próprio, a Brevo pode substituir o
              endereço exibido. O plano gratuito permite 300 e-mails por dia.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />A chave é guardada
              criptografada e usada somente pelo servidor.
            </div>
            <a
              href="https://app.brevo.com/settings/keys/smtp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-primary underline underline-offset-4"
            >
              Abrir Brevo · selecione a aba API
            </a>
          </div>
          <div className="min-w-0 space-y-5 rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5">
            <p className="text-sm font-semibold">Remetente e credenciais</p>{" "}
            <div>
              <Label htmlFor="brevo-api-key">Chave API da Brevo</Label>
              <Input
                id="brevo-api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  data?.configured
                    ? "Chave salva. Cole outra somente para substituir."
                    : "Cole sua chave API aqui"
                }
                className="mt-1.5"
                disabled={!!busy}
                aria-describedby="brevo-key-help"
              />
              <p id="brevo-key-help" className="mt-1 text-xs text-muted-foreground">
                Use a chave da aba API, não a chave SMTP. Após salvar, ela fica oculta. Deixe em
                branco para manter a chave existente.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="brevo-sender-name">Nome do remetente</Label>
                <Input
                  id="brevo-sender-name"
                  value={senderName}
                  onChange={(event) => setSenderName(event.target.value)}
                  maxLength={80}
                  required
                  disabled={!!busy}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="brevo-sender-email">E-mail do remetente</Label>
                <Input
                  id="brevo-sender-email"
                  type="email"
                  value={senderEmail}
                  onChange={(event) => setSenderEmail(event.target.value)}
                  maxLength={254}
                  required
                  disabled={!!busy}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!!busy || !dirty}>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {busy === "save" ? "Salvando…" : "Salvar Brevo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={sendTest}
                disabled={!!busy || !data?.configured || dirty}
              >
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                {busy === "test" ? "Enviando…" : "Enviar teste para meu e-mail"}
              </Button>
            </div>
            {dirty && data?.configured && (
              <p className="text-xs text-muted-foreground">
                Salve as alterações antes de enviar o teste.
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
