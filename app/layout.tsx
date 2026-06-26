import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ChatWidget from "./components/ChatWidget";
import { DemoModalProvider } from "./context/DemoModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InstantDesk — AI Receptionist + Live Chat for Local Businesses",
  description:
    "AI receptionist and live chat for local businesses that cannot afford missed leads. Website chat, lead capture, Google Sheet CRM, SMS follow-up, and review requests.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  keywords: [
    "AI receptionist",
    "live chat for small businesses",
    "website chat",
    "business automation",
    "chatbot",
    "lead capture",
    "Google reviews automation",
    "Google Sheet CRM",
  ],
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
      <body className="min-h-full flex flex-col bg-[#080807]" suppressHydrationWarning>
        <DemoModalProvider>
          {children}
          <ChatWidget />
        </DemoModalProvider>
        <Script
          id="microsoft-clarity"
          strategy="afterInteractive"
        >{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "wtw4hugh74");
        `}</Script>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-FWGK1BYX05"
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
        >{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-FWGK1BYX05');
        `}</Script>
      </body>
    </html>
  );
}
