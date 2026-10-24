import type { Metadata, Viewport } from 'next';
import {
  Atkinson_Hyperlegible_Next,
  Atkinson_Hyperlegible_Mono,
} from 'next/font/google';
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

const atkinson = Atkinson_Hyperlegible_Next({
  variable: '--font-atkinson',
  style: ['normal', 'italic'],
  subsets: ['latin', 'latin-ext'],
});
const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: '--font-atkinson-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'Mnemo', template: '%s · Mnemo' },
  description:
    'Turn a lecture deck into a slide-by-slide walkthrough, flashcards, quizzes and practice problems.',
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
      className={`${atkinson.variable} ${atkinsonMono.variable}`}
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
