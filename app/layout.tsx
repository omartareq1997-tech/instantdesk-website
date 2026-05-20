import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ChatWidget from "./components/ChatWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InstantDesk — AI Receptionist & Automation Systems",
  description:
    "AI receptionists, website chatbots, WhatsApp/SMS automation, lead capture, booking systems, and review automation for ambitious businesses. Go live in 72 hours.",
  keywords: [
    "AI receptionist",
    "business automation",
    "chatbot",
    "WhatsApp automation",
    "lead capture",
    "booking system",
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
    >
      <body className="min-h-full flex flex-col bg-[#050510]">
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
