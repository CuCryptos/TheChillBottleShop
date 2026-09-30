import { test } from "node:test";
import assert from "node:assert/strict";
import { hawaiiToday, isOfAge, parseSignup } from "../lib/validate.ts";

const form = (fields: Record<string, string>) => new Map(Object.entries(fields)) as unknown as FormData;

const valid = {
  email: "  Aloha@Example.com ",
  firstName: "Kai",
  dateOfBirth: "1990-05-01",
  island: "oahu",
  postalCode: "96813",
  consent: "yes",
};

test("accepts a valid signup and normalizes email", () => {
  const r = parseSignup(form(valid), "2026-10-01");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.email, "aloha@example.com");
    assert.equal(r.data.wantsFounding, false);
    assert.equal(r.data.heardFrom, null);
    assert.equal(r.data.referredBy, null);
  }
});

test("21st birthday is accepted on the day, rejected the day before", () => {
  assert.equal(isOfAge("2005-10-01", "2026-10-01"), true);
  assert.equal(isOfAge("2005-10-02", "2026-10-01"), false);
  assert.equal(isOfAge("2005-02-29", "2026-10-01"), false, "impossible date");
  assert.equal(isOfAge("1800-01-01", "2026-10-01"), false, "implausible age");
});

test("uses Hawaiʻi's calendar date, not UTC", () => {
  // 2026-10-02 05:00 UTC is still Oct 1 in Honolulu (UTC-10).
  assert.equal(hawaiiToday(new Date("2026-10-02T05:00:00Z")), "2026-10-01");
});

test("rejects under-21, non-Hawaiʻi ZIP, bad island and missing consent", () => {
  const r = parseSignup(form({ ...valid, dateOfBirth: "2010-01-01", postalCode: "90210", island: "guam", consent: "" }), "2026-10-01");
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["consent", "dateOfBirth", "island", "postalCode"]);
});

test("keeps well-formed referral codes and known sources only", () => {
  const r = parseSignup(form({ ...valid, ref: "ABCDEF12", heardFrom: "hopgrail", wantsFounding: "yes" }), "2026-10-01");
  assert.ok(r.ok && r.data.referredBy === "abcdef12" && r.data.heardFrom === "hopgrail" && r.data.wantsFounding);
  const bad = parseSignup(form({ ...valid, ref: "'; drop table", heardFrom: "spam" }), "2026-10-01");
  assert.ok(bad.ok && bad.data.referredBy === null && bad.data.heardFrom === null);
});
