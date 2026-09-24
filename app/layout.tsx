import type { Metadata } from "next";
import "./globals.css";
import { HrisProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Shantahl HRIS — Demo",
  description: "Shantahl Direct Sales Inc. Human Resource Information System (demo instance)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <HrisProvider>{children}</HrisProvider>
      </body>
    </html>
  );
}
