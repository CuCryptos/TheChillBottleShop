import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff — The Chill Bottle Shop",
  robots: { index: false, follow: false },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>;
}
