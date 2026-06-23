import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Vyapar Sarthi - Smart Business & POS Management App',
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
    title: 'Vyapar Sarthi - Smart Business & POS Management App',
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
    title: 'Vyapar Sarthi - Smart Business & POS Management App',
    description: 'Vyapar Sarthi is an advanced management application for wholesalers, distributors, retail shops, and all types of businesses.',
    creator: '@vyaparsarthi',
    images: ['/og-image.jpg'],
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png', // Optional: add an apple touch icon
  },
  manifest: '/manifest.json', // Useful for PWA
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'light') {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
