import type { Metadata } from 'next';
import SlideWalkthrough from '@/components/learn/SlideWalkthrough';

export const metadata: Metadata = { title: 'Walkthrough' };

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ slide?: string }>;
}) {
  const { documentId } = await params;
  const { slide } = await searchParams;
  const requested = Number(slide);
  return (
    <SlideWalkthrough
      key={documentId}
      documentId={documentId}
      initialSlide={
        Number.isInteger(requested) && requested > 0 ? requested : null
      }
    />
  );
}
