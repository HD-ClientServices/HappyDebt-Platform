import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import "./global.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Intro Client Portal",
  description: "MCA call analytics and voice of the customer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", spaceGrotesk.variable, inter.variable)}>
      <body className={cn("font-sans antialiased bg-background text-foreground")}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
