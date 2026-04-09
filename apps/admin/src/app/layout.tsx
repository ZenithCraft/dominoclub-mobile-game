import type { Metadata } from 'next';
import './globals.css';
import logo from '../../../mobile/assets/77e79dbf0c599ad464ce3be2691d2da40106953d.png';

export const metadata: Metadata = {
  title: 'DominoClub Admin',
  description: 'DominoClub administrative dashboard',
  icons: {
    icon: [{ url: logo.src }],
    apple: [{ url: logo.src }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Blocking script: reads localStorage before React hydrates to avoid sidebar flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('admin_sidebar_collapsed')==='true')document.documentElement.classList.add('sidebar-collapsed')}catch(e){}})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
