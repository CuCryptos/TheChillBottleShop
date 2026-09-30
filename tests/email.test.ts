import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { renderConfirmation } from "../lib/email-template.ts";
import { sendConfirmation } from "../lib/email.ts";

const input = { firstName: "Kai", inviteUrl: "https://example.test/?ref=abcdef12", wantsFounding: true };

test("confirmation includes the invite link in both HTML and text", () => {
  const { subject, html, text } = renderConfirmation(input);
  assert.match(subject, /on the list/);
  assert.ok(html.includes('href="https://example.test/?ref=abcdef12"'));
  assert.ok(text.includes("https://example.test/?ref=abcdef12"));
  assert.ok(text.startsWith("Aloha Kai,"));
  assert.ok(!/<[a-z]/i.test(text), "plain-text part has no markup");
});

test("names are HTML-escaped", () => {
  const { html } = renderConfirmation({ ...input, firstName: `<script>alert("x")</script>` });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
});

test("Founding wording depends on the checkbox", () => {
  assert.match(renderConfirmation(input).text, /interested in a Founding Membership/);
  assert.match(renderConfirmation({ ...input, wantsFounding: false }).text, /reply to this email and we'll note it/);
});

const realFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

test("sends through Resend with an idempotency key", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Shop <aloha@example.test>";
  process.env.EMAIL_REPLY_TO = "hello@example.test";
  let call: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    call = { url, init };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  assert.equal(await sendConfirmation("kai@example.test", input, "waitlist-confirmation/abcdef12"), "sent");
  assert.equal(call?.url, "https://api.resend.com/emails");
  const headers = call?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test");
  assert.equal(headers["Idempotency-Key"], "waitlist-confirmation/abcdef12");
  const body = JSON.parse(String(call?.init.body));
  assert.deepEqual(body.to, ["kai@example.test"]);
  assert.equal(body.from, "Shop <aloha@example.test>");
  assert.equal(body.reply_to, "hello@example.test");
  assert.ok(body.html && body.text);
});

test("skips quietly when email isn't configured", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  globalThis.fetch = (async () => assert.fail("should not call the API")) as typeof fetch;
  const log = console.info;
  console.info = () => {};
  try {
    assert.equal(await sendConfirmation("kai@example.test", input, "k"), "skipped");
  } finally {
    console.info = log;
  }
});

test("reports failure without throwing", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "aloha@example.test";
  const error = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = (async () => new Response("domain not verified", { status: 403 })) as typeof fetch;
    assert.equal(await sendConfirmation("kai@example.test", input, "k"), "failed");
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    assert.equal(await sendConfirmation("kai@example.test", input, "k"), "failed");
  } finally {
    console.error = error;
  }
});
