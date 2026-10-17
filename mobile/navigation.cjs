const profiles = require("./profiles.json");
function navigationAction(raw, profile) {
  const app = profiles[profile];
  if (!app) return "block";
  if (raw === "about:blank") return "allow";
  try {
    const url = new URL(raw);
    if (url.username || url.password) return "block";
    if (url.protocol === "https:" && url.origin === app.origin) return "allow";
    if (["https:", "mailto:", "tel:", "whatsapp:"].includes(url.protocol)) return "external";
  } catch {
    /* Invalid URLs stay blocked. */
  }
  return "block";
}
module.exports = { navigationAction };
