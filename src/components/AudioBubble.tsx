'use client';
interface AudioBubbleProps {
  isSpeaking: boolean;
  isRecording: boolean;
  size?: number;
}
/** Activity indicator: no continuously running canvas or audio processing graph. */
export default function AudioBubble({
  isSpeaking,
  isRecording,
  size = 200,
}: AudioBubbleProps) {
  const active = isSpeaking || isRecording;
  return (
    <div
      className={`audio-activity ${active ? 'is-active' : ''} ${isRecording ? 'is-recording' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        isRecording
          ? 'Recording your voice'
          : isSpeaking
            ? 'Mnemo is speaking'
            : 'Ready for voice practice'
      }
    >
      <svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <circle cx="100" cy="100" r="76" stroke="currentColor" opacity=".2" />
        <circle cx="100" cy="100" r="58" stroke="currentColor" opacity=".5" />
        <path
          d="M20 100H40M160 100H180M100 20V40M100 160V180"
          stroke="currentColor"
          opacity=".4"
        />
        {[20, 36, 52, 62, 52, 36, 20].map((height, i) => (
          <rect
            className="audio-activity-bar"
            key={i}
            x={65 + i * 10}
            y={100 - height / 2}
            width="4"
            height={height}
            rx="2"
            fill="currentColor"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}
