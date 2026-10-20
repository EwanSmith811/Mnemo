'use client';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode, SVGProps } from 'react';
import { useModalFocus } from '@/lib/use-modal-focus';

/* A small, consistent stroke icon set (1.5px, 24px grid). */
const paths = {
  back: 'M15 18 9 12l6-6',
  next: 'm9 18 6-6-6-6',
  arrow: 'M7 17 17 7M8 7h9v9',
  check: 'm5 12.5 4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4.2-4.2M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z',
  sun: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  upload:
    'M12 15V4m-4.5 4.5L12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  trash:
    'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3',
  send: 'M5 12h14M13 6l6 6-6 6',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 17v4',
  stop: 'M7 7h10v10H7z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sparkle:
    'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  refresh:
    'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 18,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="back-link">
      <Icon name="back" size={14} />
      {children}
    </Link>
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <div className="page-loading" role="status">
      <span className="page-loading-mark" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {label}
    </div>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const panel = useModalFocus(true, () => {
    if (!busy) onClose();
  });
  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Inline style for the staggered `.rise` entrance animation. */
export const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

/** Thin progress bar; value is a 0–1 fraction. */
export function Meter({ value, tone }: { value: number; tone?: 'good' }) {
  return (
    <div
      className={`meter ${tone === 'good' ? 'is-good' : ''}`}
      role="presentation"
      style={{ '--value': Math.max(0, Math.min(1, value)) } as CSSProperties}
    >
      <span />
    </div>
  );
}
