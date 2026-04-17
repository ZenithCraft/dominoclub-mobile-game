import type { Metadata } from 'next';
import './globals.css';
const logo = { src: '/logo.png' };

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
