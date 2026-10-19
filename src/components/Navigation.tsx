'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const TOOLS = [
  ['documents', 'Overview'],
  ['graph', 'Concept map'],
  ['flashcards', 'Flashcards'],
  ['quiz', 'Quiz'],
  ['summaries', 'Summaries'],
  ['workbench', 'Workbench'],
  ['chat', 'Ask Mnemo'],
  ['verbal', 'Voice practice'],
];
export default function Navigation() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const documentId = segments[1];
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <nav className="site-navigation" aria-label="Main navigation">
        <Link href="/" className="wordmark">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 22V6L14 18L25 6V22"
              stroke="currentColor"
              strokeWidth="2.4"
            />
            <path d="M3 6H8M20 22H25" stroke="currentColor" strokeWidth="2.4" />
          </svg>
          mnemo<span className="brand-period">.</span>
        </Link>
        <Link
          href="/"
          className="library-link"
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          Document library
        </Link>
        <span className="nav-caption">Make knowledge stick.</span>
      </nav>
      {documentId && TOOLS.some(([route]) => route === segments[0]) && (
        <nav className="study-navigation" aria-label="Study tools">
          {TOOLS.map(([route, label]) => (
            <Link
              key={route}
              href={`/${route}/${documentId}`}
              aria-current={segments[0] === route ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
