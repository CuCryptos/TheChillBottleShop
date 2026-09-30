import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Inter } from "next/font/google";
import { AgeGate } from "./AgeGate";
import { AGE_COOKIE } from "@/lib/age";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "The Chill Bottle Shop — Members-first beer for Hawaiʻi",
  description:
    "A members-first bottle shop for Hawaiʻi. Limited beer drops, reserved before they land. Join the waitlist for a Founding Membership.",
  openGraph: {
    title: "The Chill Bottle Shop",
    description: "Rare beer, reserved before it lands. Join the Hawaiʻi waitlist.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#0e2a33" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const verified = (await cookies()).get(AGE_COOKIE)?.value === "1";

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {!verified && <AgeGate />}
        {children}
      </body>
    </html>
  );
}
