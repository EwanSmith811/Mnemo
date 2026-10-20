'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TOOLS = [
  ['flashcards', 'Flashcards'],
  ['quiz', 'Quiz'],
  ['workbench', 'Workbench'],
] as const;

/** Switch between the three practice tools; the main nav has one Practice tab. */
export default function PracticeTabs({ documentId }: { documentId: string }) {
  const section = usePathname().split('/').filter(Boolean)[0];
  return (
    <nav className="practice-tabs segmented" aria-label="Practice">
      {TOOLS.map(([route, label]) => (
        <Link
          key={route}
          href={`/${route}/${documentId}`}
          aria-current={section === route ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
