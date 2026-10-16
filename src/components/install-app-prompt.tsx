import { useLocation } from "@tanstack/react-router";
import { appProfileFromUrl } from "@/lib/app-profiles";
import { AppDownloadLinks } from "@/components/app-download-links";
export function InstallAppPrompt() {
  const location = useLocation();
  const profile = appProfileFromUrl(location.pathname, location.searchStr);
  if (
    !/^\/(?:cliente|estabelecimento|entregador)(?:\/|$)/.test(location.pathname) &&
    location.pathname !== "/auth" &&
    location.pathname !== "/"
  )
    return null;
  return <AppDownloadLinks key={profile} perfilAtual={profile} />;
}
