import type { Metadata } from 'next';
import { Inter, Source_Code_Pro } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import { cn } from '@/lib/utils';
import { AudioProvider } from '@/hooks/use-audio';
import { SocketProvider } from '@/contexts/socket-context';

const fontBody = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

const fontCode = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-code',
});

export const metadata: Metadata = {
  title: 'DrawTogether',
  description: 'A real-time multiplayer drawing and guessing game.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
       <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Source+Code+Pro&display=swap" rel="stylesheet" />
      </head>
      <body className={cn('font-body antialiased', fontBody.variable, fontCode.variable)}>
        <AudioProvider>
            <SocketProvider>
              {children}
              <Toaster />
            </SocketProvider>
        </AudioProvider>
      </body>
    </html>
  );
}
