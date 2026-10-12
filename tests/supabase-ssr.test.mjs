import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

test("SSR initializes the real client using server configuration without browser globals", async () => {
  const url = "https://example.supabase.co";
  const key = "sb_publishable_isolated-ssr-test";
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_PUBLISHABLE_KEY = key;
  const clientUrl = new URL("../src/integrations/supabase/client.ts", import.meta.url);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@/lib/supabase-config") {
        return {
          url: new URL("../src/lib/supabase-config.ts", import.meta.url).href,
          shortCircuit: true,
        };
      }
      return nextResolve(specifier, context);
    },
    load(moduleUrl, context, nextLoad) {
      const loaded = nextLoad(moduleUrl, context);
      if (moduleUrl === clientUrl.href) {
        const source =
          typeof loaded.source === "string"
            ? loaded.source
            : Buffer.from(loaded.source).toString("utf8");
        return { ...loaded, source: source.replaceAll("import.meta.env", "({})") };
      }
      return loaded;
    },
  });
  try {
    const { supabase } = await import(clientUrl.href);
    assert.equal(supabase.supabaseUrl, url);
    const session = await supabase.auth.getSession();
    assert.equal(session.data.session, null);
    await supabase.auth.stopAutoRefresh();
  } finally {
    hooks.deregister();
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
