export interface StudyMessage {
  role: 'user' | 'assistant';
  content: string;
}
export function isStudyMessages(value: unknown): value is StudyMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 100 &&
    value.every(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0 &&
        m.content.length <= 12000,
    ) &&
    value.reduce((sum, m) => sum + m.content.length, 0) <= 60000
  );
}
