import { useLocation } from "@tanstack/react-router";
import { appProfileFromUrl, isProfileLoginPath } from "@/lib/app-profiles";
import { AppDownloadLinks } from "@/components/app-download-links";

export function InstallAppPrompt() {
  const location = useLocation();
  if (!isProfileLoginPath(location.pathname)) return null;
  const profile = appProfileFromUrl(location.pathname, location.searchStr);
  return <AppDownloadLinks key={`${profile}:${location.pathname}`} perfilAtual={profile} />;
}
