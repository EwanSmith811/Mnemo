import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, document_id, question, question_type, choices, correct_answer, correct_answers, correct_answer_text, numeric_answer, answer_tolerance, answer_unit, explanation")
    .eq("document_id", documentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
