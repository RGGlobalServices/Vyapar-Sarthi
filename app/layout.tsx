import localFont from 'next/font/local';
import './globals.css';

// Self-hosted: next/font/google downloads from Google at build time, and that fetch fails on the Hostinger build server.
const inter = localFont({ src: './fonts/Inter-latin-variable.woff2', weight: '100 900', display: 'swap', fallback: ['system-ui', 'sans-serif'] });
// Sturdy Devanagari for Marathi/Hindi bills: the system fallback font is too thin to read on a thermal printer.
// Two static files cover the weights the bills use (500 -> Regular, 600/700 -> Bold). Not preloaded: only invoices use it.
const deva = localFont({
  src: [
    { path: '../public/fonts/NotoSansDevanagari-Regular.ttf', weight: '400 500', style: 'normal' },
    { path: '../public/fonts/NotoSansDevanagari-Bold.ttf', weight: '600 700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-deva',
  preload: false,
});

import { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#10b981',
};
export const metadata: Metadata = {
  title: {
    default: 'VyaparSarthii — Apne Business Ko Smart Banao',
    template: '%s | Vyapar Sarthi'
  },
  description: 'Vyapar Sarthi is an advanced management application for wholesalers, distributors, retail shops, and all types of businesses. Manage inventory, billing, payments, and customers with ease.',
  keywords: ['business management app', 'wholesale software', 'distributor software', 'retail billing software', 'vyapar sarthi', 'inventory management', 'POS system'],
  authors: [{ name: 'Vyapar Sarthi Team' }],
  creator: 'Vyapar Sarthi',
  publisher: 'Vyapar Sarthi',
  metadataBase: new URL('https://vyaparsarthii.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://vyaparsarthii.com',
    title: 'VyaparSarthii — Apne Business Ko Smart Banao',
    description: 'Vyapar Sarthi is an advanced management application for wholesalers, distributors, retail shops, and all types of businesses.',
    siteName: 'Vyapar Sarthi',
    images: [
      {
        url: '/og-image.jpg', // You will need to add an actual image at public/og-image.jpg
        width: 1200,
        height: 630,
        alt: 'Vyapar Sarthi App Preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VyaparSarthii — Apne Business Ko Smart Banao',
    description: 'Vyapar Sarthi is an advanced management application for wholesalers, distributors, retail shops, and all types of businesses.',
    creator: '@vyaparsarthi',
    images: ['/og-image.jpg'],
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png', 
  },
  manifest: '/manifest.json', 
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
        <head />
      <body className={`${inter.className} ${deva.variable} bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

// Trigger HMR
