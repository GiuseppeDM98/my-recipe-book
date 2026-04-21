import './globals.css';
import { Bodoni_Moda, Jost } from 'next/font/google';
import { Providers } from '@/components/providers';

const displayFont = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const bodyFont = Jost({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['300', '400', '500', '600'],
});

export const metadata = {
  title: 'Il Mio Ricettario - Gestisci le tue ricette',
  description: 'Un ricettario digitale privato per organizzare e cucinare le tue ricette preferite con intelligenza artificiale.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
