import type { Metadata } from "next";
import { Providers } from "@/components/shell/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Immunisatieroadmap Curaçao — prototype",
  description: "Bilingual immunization decision & implementation roadmap prototype (local demo data only).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
