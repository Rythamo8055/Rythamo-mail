import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rythamo Mail - Disposable Temporary Email",
  description: "Generate disposable email addresses instantly. No signup, no trace. Auto-expires after 10 minutes.",
  keywords: ["temp mail", "disposable email", "temporary email", "throwaway email"],
  openGraph: {
    title: "Rythamo Mail",
    description: "Disposable email. No signup. No trace.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.setAttribute("data-theme","light")}else{document.documentElement.removeAttribute("data-theme")}}catch(e){}})()`
        }} />
      </head>
      <body className="min-h-full flex flex-col" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        {children}
      </body>
    </html>
  );
}
