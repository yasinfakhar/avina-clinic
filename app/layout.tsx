import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";

export const metadata: Metadata = {
  title: "سامانه مدیریت شنوایی‌سنجی",
  description: "مدیریت پرونده‌ها و تشخیص‌های شنوایی‌سنجی",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/avina-logo-transparent.png",
    shortcut: "/avina-logo-transparent.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
