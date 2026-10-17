const profiles = require("./profiles.json");
const profile = process.env.PEDETREM_APP || "cliente";
if (!Object.hasOwn(profiles, profile)) throw new Error("PEDETREM_APP inválido");
const app = profiles[profile];
const projectId = process.env.EAS_PROJECT_ID;
module.exports = {
  name: app.name,
  slug: "pedetrem-" + profile,
  version: "1.0.0",
  platforms: ["ios", "android"],
  scheme: "pedetrem-" + profile,
  orientation: "portrait",
  icon: "./assets/" + profile + ".png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: app.id,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "Envie fotos necessárias ao seu cadastro e aos pedidos.",
      NSPhotoLibraryUsageDescription: "Selecione fotos para seu cadastro e seus pedidos.",
      NSLocationWhenInUseUsageDescription:
        "Use sua localização para endereço e acompanhamento de entregas.",
    },
  },
  android: {
    package: app.id,
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    adaptiveIcon: { foregroundImage: "./assets/" + profile + ".png", backgroundColor: app.color },
  },
  extra: { profile, ...app, ...(projectId ? { eas: { projectId } } : {}) },
};
