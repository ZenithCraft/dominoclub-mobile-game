import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DominoClub Admin',
  description: 'DominoClub administrative dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
