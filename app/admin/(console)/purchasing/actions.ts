"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { friendlyDbError } from "@/lib/admin-errors";
import { db } from "@/lib/db";
import { PO_STATUSES, label } from "@/lib/db-enums";
import { date, oneOf, text, uuid } from "@/lib/form-fields";
import { parseDollars } from "@/lib/money";
import { back } from "../../back";

const PAGE = "/admin/purchasing";

async function client() {
  await requireAdmin();
  return db() ?? back(PAGE, "error", "Database not configured.");
}

export async function createPo(form: FormData) {
  const supabase = await client();
  const poNumber = text(form, "po_number", 40);
  const arrival = text(form, "expected_arrival") ? date(form, "expected_arrival") : null;
  if (!poNumber) back(PAGE, "error", "Enter a PO number.");
  if (text(form, "expected_arrival") && !arrival) back(PAGE, "error", "Expected arrival must be a valid date.");
  const { error } = await supabase.from("purchase_orders").insert({ po_number: poNumber, expected_arrival: arrival });
  if (error) back(PAGE, "error", friendlyDbError(error, "create the purchase order"));
  back(PAGE, "ok", `Created ${poNumber}.`);
}

export async function setPoStatus(form: FormData) {
  const supabase = await client();
  const id = uuid(form, "id");
  const status = oneOf(form, "status", PO_STATUSES);
  if (!id || !status) back(PAGE, "error", "Choose a status.");

  const { data: po, error: readError } = await supabase.from("purchase_orders").select("submitted_at, received_at").eq("id", id).single();
  if (readError || !po) back(PAGE, "error", friendlyDbError(readError, "find the purchase order"));
  const now = new Date().toISOString();
  const { error } = await supabase.from("purchase_orders").update({
    status,
    ...(status === "submitted" && !po.submitted_at ? { submitted_at: now } : {}),
    ...(status === "received" && !po.received_at ? { received_at: now } : {}),
  }).eq("id", id);
  if (error) back(PAGE, "error", friendlyDbError(error, "change the status"));
  back(PAGE, "ok", `Status set to ${label(status).toLowerCase()}.`);
}

export async function recordInvoice(form: FormData) {
  const supabase = await client();
  const id = uuid(form, "id");
  const number = text(form, "invoice_number", 60);
  const invoiceDate = date(form, "invoice_date");
  const total = parseDollars(text(form, "invoice_total", 20));
  if (!id) back(PAGE, "error", "Unknown purchase order.");
  if (!number || !invoiceDate || total === null) back(PAGE, "error", "Enter the invoice number, date and total in dollars.");
  const { error } = await supabase.from("purchase_orders")
    .update({ invoice_number: number, invoice_date: invoiceDate, invoice_total_cents: total }).eq("id", id);
  if (error) back(PAGE, "error", friendlyDbError(error, "record the invoice"));
  back(PAGE, "ok", `Invoice ${number} recorded. HRS §281-42: pay within 30 days of the invoice date.`);
}

export async function markPaid(form: FormData) {
  const supabase = await client();
  const id = uuid(form, "id");
  if (!id) back(PAGE, "error", "Unknown purchase order.");
  const { data, error } = await supabase.from("purchase_orders")
    .update({ paid_at: new Date().toISOString() }).eq("id", id).is("paid_at", null).not("invoice_date", "is", null)
    .select("po_number");
  if (error) back(PAGE, "error", friendlyDbError(error, "mark it paid"));
  if (!data || data.length === 0) back(PAGE, "error", "Record the invoice first (or it's already paid).");
  back(PAGE, "ok", `${data[0].po_number} marked paid.`);
}
