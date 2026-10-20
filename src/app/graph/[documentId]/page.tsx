'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui';

const GraphClient = dynamic(() => import('@/components/GraphClient'), {
  ssr: false,
  loading: () => <PageLoading label="Laying out the concept map" />,
});

export default function GraphPage() {
  return <GraphClient />;
}
