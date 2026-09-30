import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_TTL_MS, adminConfig, passwordMatches, signSession, verifySession } from "../lib/admin-session.ts";

const secret = "s".repeat(32);
const now = Date.UTC(2026, 9, 1, 12);

test("admin is disabled unless both env vars are set and the secret is long enough", () => {
  assert.equal(adminConfig({}), null);
  assert.equal(adminConfig({ ADMIN_PASSWORD: "pw" }), null);
  assert.equal(adminConfig({ ADMIN_SESSION_SECRET: secret }), null);
  assert.equal(adminConfig({ ADMIN_PASSWORD: "", ADMIN_SESSION_SECRET: secret }), null);
  assert.equal(adminConfig({ ADMIN_PASSWORD: "pw", ADMIN_SESSION_SECRET: "short" }), null);
  assert.deepEqual(adminConfig({ ADMIN_PASSWORD: "pw", ADMIN_SESSION_SECRET: secret }), { password: "pw", secret });
});

test("password check", () => {
  assert.equal(passwordMatches("correct horse", "correct horse"), true);
  assert.equal(passwordMatches("correct hors", "correct horse"), false);
  assert.equal(passwordMatches("", ""), false, "empty expected password never matches");
  assert.equal(passwordMatches("x".repeat(5000), "correct horse"), false);
});

test("a signed session verifies until it expires 12 hours later", () => {
  const token = signSession(secret, now);
  assert.equal(verifySession(token, secret, now), true);
  assert.equal(verifySession(token, secret, now + SESSION_TTL_MS - 1), true);
  assert.equal(verifySession(token, secret, now + SESSION_TTL_MS), false);
  assert.equal(SESSION_TTL_MS, 12 * 60 * 60 * 1000);
});

test("rejects tampered, foreign, far-future and malformed tokens", () => {
  const token = signSession(secret, now);
  const [exp, sig] = token.split(".");
  assert.equal(verifySession(`${Number(exp) + 1000}.${sig}`, secret, now), false, "extended expiry");
  assert.equal(verifySession(token, "t".repeat(32), now), false, "other secret");
  assert.equal(verifySession(token, "", now), false, "no secret");
  const future = signSession(secret, now + 7 * SESSION_TTL_MS);
  assert.equal(verifySession(future, secret, now), false, "expiry beyond the session lifetime");
  for (const bad of [undefined, "", "abc", `${exp}.`, `${exp}.${sig}x`, `${exp}.${sig}.x`, `-1.${sig}`]) {
    assert.equal(verifySession(bad, secret, now), false, String(bad));
  }
});
