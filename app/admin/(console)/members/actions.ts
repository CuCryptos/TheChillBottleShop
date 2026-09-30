"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { friendlyDbError } from "@/lib/admin-errors";
import { db } from "@/lib/db";
import { MEMBERSHIP_STATUSES, label } from "@/lib/db-enums";
import { oneOf, uuid } from "@/lib/form-fields";
import { back } from "../../back";

const PAGE = "/admin/members";

export async function setMembershipStatus(form: FormData) {
  await requireAdmin();
  const supabase = db() ?? back(PAGE, "error", "Database not configured.");
  const id = uuid(form, "membership_id");
  const status = oneOf(form, "status", MEMBERSHIP_STATUSES);
  if (!id || !status) back(PAGE, "error", "Choose a status.");
  const { error } = await supabase.from("memberships").update({ status }).eq("id", id);
  if (error) back(PAGE, "error", friendlyDbError(error, "change the membership"));
  back(PAGE, "ok", `Membership set to ${label(status).toLowerCase()}.`);
}
