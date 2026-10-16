import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthSync } from "@/components/auth-sync";
import { LiveRefresh } from "@/components/live-refresh";
import { InstallAppPrompt } from "@/components/install-app-prompt";

import { IFomeLogo } from "@/components/ifome-logo";
import { APP_URL } from "@/lib/app-config";
import { APP_PROFILES, appProfileFromUrl } from "@/lib/app-profiles";

const BRAND_LOGO_URL = APP_PROFILES.cliente.icon;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <IFomeLogo size="lg" showWord={false} className="mx-auto mb-6" />
        <h1 className="text-7xl font-black text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-brand"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: ({ location }) => ({
    installationProfile: appProfileFromUrl(location.pathname, location.searchStr),
  }),
  head: ({ match }) => {
    const app = APP_PROFILES[match.context.installationProfile];
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "PedeTrem — Peça em minutos, receba em casa" },
        {
          name: "description",
          content:
            "PedeTrem é a plataforma de delivery que conecta clientes, restaurantes e entregadores em tempo real. Peça sua comida favorita e acompanhe cada etapa.",
        },
        { name: "theme-color", content: app.color },
        { property: "og:site_name", content: "PedeTrem" },
        { property: "og:title", content: "PedeTrem — Delivery em tempo real" },
        {
          property: "og:description",
          content:
            "Descubra restaurantes próximos, faça seu pedido e acompanhe a entrega ao vivo. Tudo em um só lugar.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: app.shortName },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/png", href: app.icon },
        { rel: "apple-touch-icon", href: app.appleIcon },
        { rel: "manifest", href: app.manifest },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "PedeTrem",
            url: APP_URL,
            logo: `${APP_URL}${BRAND_LOGO_URL}`,
            description:
              "Plataforma de delivery que conecta clientes, restaurantes e entregadores em tempo real.",
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "PedeTrem",
            url: APP_URL,
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthSync />
        <LiveRefresh />
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        <div id="conteudo" className="relative h-full">
          <InstallAppPrompt />
          <Outlet />
        </div>
        <Toaster richColors closeButton position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
