/**
 * Plays a story as a growing queue of short speech chunks. Audio for the next
 * chunks is fetched ahead of time; if the story is still being written, the
 * narrator waits and resumes on its own when more text arrives.
 */
export type NarratorState =
  'idle' | 'loading' | 'playing' | 'paused' | 'waiting' | 'done' | 'error';

interface Chunk {
  text: string;
  scene: number;
  audio?: Promise<string>;
}

const PREFETCH = 2;

export class Narrator {
  private chunks: Chunk[] = [];
  private index = 0;
  private audio = new Audio();
  private complete = false;
  private state: NarratorState = 'idle';
  private urls = new Set<string>();
  private generation = 0;

  constructor(
    private voice: string,
    private onState: (state: NarratorState) => void,
    private onScene: (scene: number) => void,
    private onError: (message: string) => void,
  ) {
    this.audio.addEventListener('ended', () => this.advance());
    this.audio.addEventListener('error', () => this.advance());
  }

  /** Add a scene's chunks. Resumes automatically if playback was waiting. */
  append(scene: number, chunks: string[]) {
    for (const text of chunks) this.chunks.push({ text, scene });
    if (this.state === 'waiting') void this.playCurrent();
    else if (this.state === 'playing') this.prefetch();
  }

  /** The story is fully written; running out of chunks now means the end. */
  finish() {
    this.complete = true;
    if (this.state === 'waiting') this.set('done');
  }

  setVoice(voice: string) {
    if (voice === this.voice) return;
    this.voice = voice;
    // Re-fetch everything not yet played in the new voice.
    for (const chunk of this.chunks.slice(this.index + 1))
      chunk.audio = undefined;
    if (this.state === 'playing' || this.state === 'loading') {
      this.chunks[this.index].audio = undefined;
      void this.playCurrent();
    }
  }

  play() {
    if (this.state === 'paused') {
      this.set('playing');
      void this.audio.play().catch(() => this.set('paused'));
      return;
    }
    if (this.state === 'done') this.index = 0;
    void this.playCurrent();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.audio.pause();
    this.set('paused');
  }

  /** Jump to the first chunk of a scene. */
  seekScene(scene: number) {
    const at = this.chunks.findIndex((c) => c.scene === scene);
    if (at < 0) return;
    this.index = at;
    void this.playCurrent();
  }

  destroy() {
    this.generation++;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
  }

  private set(state: NarratorState) {
    this.state = state;
    this.onState(state);
  }

  private fetchAudio(chunk: Chunk, attempt = 0): Promise<string> {
    return (chunk.audio ??= fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunk.text,
        voiceId: this.voice,
        style: 'story',
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Narration unavailable');
        const url = URL.createObjectURL(await res.blob());
        this.urls.add(url);
        return url;
      })
      .catch((error) => {
        chunk.audio = undefined;
        if (attempt < 1) return this.fetchAudio(chunk, attempt + 1);
        throw error;
      }));
  }

  private prefetch() {
    for (let i = this.index + 1; i <= this.index + PREFETCH; i++) {
      const chunk = this.chunks[i];
      if (chunk) void this.fetchAudio(chunk).catch(() => {});
    }
  }

  private async playCurrent() {
    const run = ++this.generation;
    const chunk = this.chunks[this.index];
    if (!chunk) {
      this.set(this.complete ? 'done' : 'waiting');
      return;
    }
    this.audio.pause();
    this.set('loading');
    this.onScene(chunk.scene);
    this.prefetch();
    try {
      const url = await this.fetchAudio(chunk);
      if (run !== this.generation) return;
      this.audio.src = url;
      await this.audio.play();
      if (run === this.generation) this.set('playing');
    } catch (error) {
      if (run !== this.generation) return;
      if ((error as Error).name === 'NotAllowedError') {
        this.set('paused');
        return;
      }
      this.onError('A line of narration failed to load, so it was skipped.');
      this.advance();
    }
  }

  private advance() {
    if (this.state === 'paused' || this.state === 'idle') return;
    this.index++;
    void this.playCurrent();
  }
}
