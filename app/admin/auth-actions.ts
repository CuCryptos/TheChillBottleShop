"use server";

import { redirect } from "next/navigation";
import { endAdminSession, startAdminSession } from "@/lib/admin-auth";
import { adminConfig, passwordMatches } from "@/lib/admin-session";

export async function login(form: FormData) {
  const config = adminConfig(process.env);
  if (!config) redirect("/admin/login");

  const password = form.get("password");
  if (typeof password !== "string" || password.length > 1000 || !passwordMatches(password, config.password)) {
    redirect("/admin/login?error=1");
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/admin/login");
}
