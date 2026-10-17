import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { appProfileFromUrl, isProfileLoginPath } from "@/lib/app-profiles";
import { nativeAppProfile } from "@/lib/native-profile";
import { AppDownloadLinks } from "@/components/app-download-links";

export function InstallAppPrompt() {
  const location = useLocation();
  const profile = appProfileFromUrl(location.pathname, location.searchStr);
  const [nativeProfile, setNativeProfile] = useState<string | null>(null);
  useEffect(() => {
    setNativeProfile(nativeAppProfile(navigator.userAgent, window.location.origin));
  }, []);
  if (!isProfileLoginPath(location.pathname) || nativeProfile === profile) return null;
  return <AppDownloadLinks key={`${profile}:${location.pathname}`} perfilAtual={profile} />;
}
