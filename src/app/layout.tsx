import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import AppShell from "@/components/AppShell";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Little Finds MY - Content Studio",
  description: "Plan, organise and track Little Finds MY social content.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable} h-full antialiased`}>
      <body className="min-h-full">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
