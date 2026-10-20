import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/ui.css';
import '@/styles/navigation.css';
import '@/styles/library.css';
import '@/styles/generation.css';
import '@/styles/dashboard.css';
import '@/styles/learn.css';
import '@/styles/flashcards.css';
import '@/styles/quiz.css';
import '@/styles/summaries.css';
import '@/styles/workbench.css';
import '@/styles/map.css';
import '@/styles/chat.css';
import '@/styles/voice.css';
import '@/styles/story.css';
import Navigation from '@/components/Navigation';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
// A soft, slightly quirky serif for headlines; optical sizing keeps large
// sizes open and the SOFT axis rounds its terminals.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'Mnemo', template: '%s · Mnemo' },
  description:
    'Turn a slide deck into a guided walkthrough, flashcards, quizzes and practice that make it stick.',
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e13' },
  ],
};

// Applies a saved theme before first paint so the page never flashes.
const themeScript = `try{var t=localStorage.getItem('mnemo-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Navigation />
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
