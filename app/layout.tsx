import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import "./global.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "intro",
  description: "We make the intro, you close the deal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" className={cn(spaceGrotesk.variable, inter.variable)}>
      <body className={cn("font-sans antialiased bg-background text-foreground")}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
