'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Icon } from './ui';
import { Wordmark } from './Logo';

export const STUDY_TOOLS = [
  ['documents', 'Overview'],
  ['learn', 'Walkthrough'],
  ['flashcards', 'Flashcards'],
  ['quiz', 'Quiz'],
  ['workbench', 'Workbench'],
  ['graph', 'Concept map'],
  ['summaries', 'Summaries'],
  ['chat', 'Ask Mnemo'],
  ['verbal', 'Voice'],
] as const;
const PRACTICE = STUDY_TOOLS.filter(([route]) =>
  ['flashcards', 'quiz', 'workbench'].includes(route),
);
// Practice tools share one tab so the bar stays calm.
const STUDY_NAV: [string, string][] = [
  ['documents', 'Overview'],
  ['learn', 'Walkthrough'],
  ['practice', 'Practice'],
  ['graph', 'Concept map'],
  ['summaries', 'Summaries'],
  ['chat', 'Ask Mnemo'],
  ['verbal', 'Voice'],
];

type Theme = 'light' | 'dark';
const themeListeners = new Set<() => void>();
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => {
    themeListeners.delete(listener);
    media.removeEventListener('change', listener);
  };
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('mnemo-theme', next);
        } catch {}
        themeListeners.forEach((listener) => listener());
      }}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const [section, documentId] = pathname.split('/').filter(Boolean);
  const inStudy =
    !!documentId && STUDY_TOOLS.some(([route]) => route === section);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <nav className="site-navigation" aria-label="Main navigation">
          <Link href="/" aria-label="Mnemo home">
            <Wordmark />
          </Link>
          <div className="site-navigation-end">
            <Link
              href="/#library"
              className="nav-link"
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              Library
            </Link>
            <Link href="/#upload" className="nav-link nav-link-cta">
              <Icon name="plus" size={15} />
              New deck
            </Link>
            <ThemeToggle />
          </div>
        </nav>
        {inStudy && (
          <nav className="study-navigation" aria-label="Study tools">
            <div>
              {STUDY_NAV.map(([route, label]) => {
                // Practice stays one tab; its tools switch inside the page.
                const practice = route === 'practice';
                const current = practice
                  ? PRACTICE.some(([p]) => p === section)
                  : section === route;
                return (
                  <Link
                    key={route}
                    href={`/${practice ? 'flashcards' : route}/${documentId}`}
                    aria-current={current ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
