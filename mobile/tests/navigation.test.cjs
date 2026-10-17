const test = require("node:test");
const assert = require("node:assert/strict");
const { navigationAction } = require("../navigation.cjs");
const profiles = require("../profiles.json");
test("each app keeps its own origin and opens other apps externally", () => {
  const ids = new Set();
  for (const [profile, app] of Object.entries(profiles)) {
    ids.add(app.id);
    assert.equal(navigationAction(app.origin + app.loginPath, profile), "allow");
    assert.equal(navigationAction(app.origin + "/auth?perfil=" + profile, profile), "allow");
    for (const other of Object.values(profiles).filter((value) => value !== app))
      assert.equal(navigationAction(other.origin, profile), "external");
  }
  assert.equal(ids.size, 3);
});
test("unsafe URLs never load or execute inside the app", () => {
  for (const profile of Object.keys(profiles)) {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,test",
      "http://pedetrem.vercel.app",
      "https://user:password@pedetrem.vercel.app",
      "intent://foo",
    ])
      assert.equal(navigationAction(url, profile), "block");
    assert.equal(navigationAction("https://pedetrem.vercel.app.evil.example", profile), "external");
  }
});
