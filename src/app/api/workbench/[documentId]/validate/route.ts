import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Answer questions through your learning session so they are checked against the saved lesson and progress is recorded.',
    },
    { status: 410 },
  );
}
