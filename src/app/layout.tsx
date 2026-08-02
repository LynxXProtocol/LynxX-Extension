import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../index.css';
import '../App.css';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';

// display: 'swap' prevents FOIT — text is readable immediately with fallback font
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'LynxX - Non-custodial Payments on Stellar',
  description: 'LynxX merges fast, non-custodial payments with real on-chain smart contracts — unlocking trustless transfers and crowdfunding on Stellar.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        {/* Early connection to Google Fonts CDN reduces font load latency */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div id="root">
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: 'rgba(20, 20, 26, 0.78)',
                backdropFilter: 'blur(28px) saturate(190%)',
                WebkitBackdropFilter: 'blur(28px) saturate(190%)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#fff',
                borderRadius: '22px',
                padding: '14px 20px',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.22)',
                fontFamily: 'Inter, -apple-system, sans-serif',
                fontSize: '0.85rem',
                fontWeight: '500',
              },
              classNames: {
                toast: 'tamber-glass-toast',
                title: 'text-white font-medium',
                description: 'text-gray-300 text-xs',
                error: '!border-red-500/50 !bg-red-950/80 !text-red-100',
                success: '!border-emerald-500/50 !bg-emerald-950/80 !text-emerald-100',
                info: '!border-amber-500/50 !bg-amber-950/80 !text-amber-100',
              },
            }}
          />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
