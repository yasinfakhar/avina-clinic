import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
});

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
        className={`${vazirmatn.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
