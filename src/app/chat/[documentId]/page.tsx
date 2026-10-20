import type { Metadata } from 'next';
import DocumentChat from '@/components/DocumentChat';

export const metadata: Metadata = { title: 'Ask Mnemo' };

export default function ChatPage() {
  return <DocumentChat />;
}
