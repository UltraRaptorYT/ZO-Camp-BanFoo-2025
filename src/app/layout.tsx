import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Head from "next/head";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Z+O Camp Banfoo 2025",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"
          integrity="sha256-sA+zWATbFveLLNqWO2gtiw3BTmPTTn6F2jCs4f2vJVc="
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://a.basemaps.cartocdn.com"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://b.basemaps.cartocdn.com"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://c.basemaps.cartocdn.com"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://d.basemaps.cartocdn.com"
          crossOrigin=""
        />
      </Head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
