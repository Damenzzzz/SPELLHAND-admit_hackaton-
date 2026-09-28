import type { Handedness, TrackedHand } from '../store/visionStore';

/** Максимальный сдвиг запястья между кадрами (доля кадра), при котором это та же рука. */
const MAX_JUMP = 0.3;
/** Сколько держим трек после пропажи руки — короткий провал детекции не сбрасывает фильтры. */
const KEEP_MS = 200;
const VOTES = 10;

interface Track {
  id: string;
  x: number;
  y: number;
  seen: number;
  votes: Handedness[];
}

export interface HandIdentityResult {
  /** Стабильный ключ трека для каждой руки кадра. */
  keys: string[];
  /** Метка руки после голосования за последние кадры. */
  handedness: Handedness[];
  /** Ключи треков, которые ещё живы (включая ненадолго пропавшие). */
  alive: string[];
}

/**
 * Идентичность рук между кадрами по ближайшему запястью, а не по метке Left/Right:
 * MediaPipe иногда путает метку на кадр — раньше это сбрасывало фильтр, трек движения
 * и снимало активную позу (мигающий щит). Метка усредняется голосованием.
 */
export class HandIdentity {
  private tracks: Track[] = [];
  private next = 1;

  assign(hands: TrackedHand[], now: number): HandIdentityResult {
    const pairs: { hi: number; ti: number; d: number }[] = [];
    hands.forEach((h, hi) => {
      this.tracks.forEach((t, ti) => {
        const d = Math.hypot(h.landmarks[0].x - t.x, h.landmarks[0].y - t.y);
        if (d <= MAX_JUMP) pairs.push({ hi, ti, d });
      });
    });
    pairs.sort((a, b) => a.d - b.d);

    const handToTrack = new Array<number>(hands.length).fill(-1);
    const usedTracks = new Set<number>();
    for (const p of pairs) {
      if (handToTrack[p.hi] !== -1 || usedTracks.has(p.ti)) continue;
      handToTrack[p.hi] = p.ti;
      usedTracks.add(p.ti);
    }

    const keys: string[] = [];
    const handedness: Handedness[] = [];
    hands.forEach((h, hi) => {
      let t = handToTrack[hi] >= 0 ? this.tracks[handToTrack[hi]] : undefined;
      if (!t) {
        t = { id: `h${this.next++}`, x: 0, y: 0, seen: now, votes: [] };
        this.tracks.push(t);
      }
      t.x = h.landmarks[0].x;
      t.y = h.landmarks[0].y;
      t.seen = now;
      t.votes.push(h.handedness);
      if (t.votes.length > VOTES) t.votes.shift();
      const left = t.votes.filter((v) => v === 'Left').length;
      keys.push(t.id);
      handedness.push(left * 2 >= t.votes.length ? 'Left' : 'Right');
    });

    this.tracks = this.tracks.filter((t) => now - t.seen <= KEEP_MS);
    return { keys, handedness, alive: this.tracks.map((t) => t.id) };
  }
}
