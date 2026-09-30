import { cookies } from "next/headers";
import { AgeGate } from "./AgeGate";
import { AGE_COOKIE } from "@/lib/age";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const verified = (await cookies()).get(AGE_COOKIE)?.value === "1";

  return (
    <>
      {!verified && <AgeGate />}
      {children}
    </>
  );
}
