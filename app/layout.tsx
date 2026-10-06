import type { Metadata, Viewport } from "next";
import "./globals.css";
import { HrisProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "LSM Group of Companies HRIS",
  description: "LSM Group of Companies Human Resource Information System — Shantahl Direct Sales, LSMBiz Credit, Daro Lending",
  applicationName: "LSM Group HRIS",
  // iPhone "Add to Home Screen": opens full-screen with this name.
  appleWebApp: { capable: true, title: "LSM Group HRIS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#013825",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-company is added by the script below, before React loads.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* LSMBiz's blue colors (app/globals.css) from the first paint, so the
            page doesn't flash green first. The key matches lib/companies.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("lsm-hris.company")==="lsmbiz")document.documentElement.dataset.company="lsmbiz"}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <HrisProvider>{children}</HrisProvider>
      </body>
    </html>
  );
}
