import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';

// GET — list up to 10 most recent conversations for this document
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;

    const { data, error } = await database
      .from('chat_conversations')
      .select('id, title, messages, updated_at')
      .eq('document_id', documentId)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('List conversations error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list conversations',
      },
      { status: 500 },
    );
  }
}

// POST — create or update a conversation, then evict LRU if > 10
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const { conversationId, title, messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages array required' },
        { status: 400 },
      );
    }

    let id = conversationId;

    if (id) {
      // Update existing conversation (touch updated_at for LRU)
      const { error } = await database
        .from('chat_conversations')
        .update({
          title,
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('document_id', documentId);

      if (error) throw error;
    } else {
      // Create new conversation
      const { data, error } = await database
        .from('chat_conversations')
        .insert({
          document_id: documentId,
          title: title || 'New conversation',
          messages,
        })
        .select('id')
        .single();

      if (error) throw error;
      id = data.id;
    }

    // LRU eviction: keep only 10 most recent, delete the rest
    const { data: all, error: listErr } = await database
      .from('chat_conversations')
      .select('id')
      .eq('document_id', documentId)
      .order('updated_at', { ascending: false });

    if (!listErr && all && all.length > 10) {
      const toDelete = all.slice(10).map((c) => c.id);
      await database.from('chat_conversations').delete().in('id', toDelete);
    }

    return NextResponse.json({ id });
  } catch (error) {
    console.error('Save conversation error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save conversation',
      },
      { status: 500 },
    );
  }
}

// DELETE — remove a specific conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id query param required' },
        { status: 400 },
      );
    }

    const { error } = await database
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('document_id', documentId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete conversation',
      },
      { status: 500 },
    );
  }
}
