import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodeFrame, parseRecording, serializeRecording, type RecordingMeta } from '../vision/recording';
import { replayRecording } from './replay';
import { FIST, OPEN, synthHand } from './synthHand';
import type { GestureId } from './types';

const FIXTURES = resolve(import.meta.dirname, '../../test/fixtures');
const GESTURES: GestureId[] = ['fireball', 'ice', 'lightning', 'wind', 'heal', 'shield'];
const HOLD: GestureId[] = ['heal', 'shield'];

describe('формат записи', () => {
  it('encode → serialize → parse → replay сохраняет распознавание', () => {
    const meta: RecordingMeta = {
      kind: 'spellhand-recording',
      v: 1,
      aspect: 16 / 9,
      width: 1280,
      height: 720,
      createdAt: '2026-09-29',
      userAgent: 'test',
    };
    const mk = (ext: typeof OPEN) => [
      { landmarks: synthHand({ ext, aspect: 16 / 9 }), handedness: 'Left' as const, score: 0.9 },
    ];
    const frames = [
      ...Array.from({ length: 30 }, (_, i) => encodeFrame(i * 33, 'shield', 120, mk(FIST))),
      ...Array.from({ length: 30 }, (_, i) => encodeFrame(1000 + i * 33, 'none', 120, [])),
    ];
    const { meta: m2, frames: f2 } = parseRecording(serializeRecording(meta, frames));
    const stats = replayRecording(m2, f2);
    expect(stats.shield.active.shield).toBeGreaterThan(20);
    // после пропажи руки поза держится, пока жив трек (HandIdentity KEEP_MS = 200 мс ≈ 6 кадров
    // на 30 FPS) — короткий провал детекции не мигает щитом; дольше — отпускается
    expect(stats.none.active.shield ?? 0).toBeLessThanOrEqual(7);
    expect(stats.none.frames - (stats.none.active.shield ?? 0)).toBeGreaterThan(20);
  });
});

// Записи реальных рук: test/fixtures/*.jsonl.gz (кнопка «⏺ Записать жесты» в ?dev=1)
const files = existsSync(FIXTURES)
  ? readdirSync(FIXTURES).filter((f) => f.endsWith('.jsonl.gz') || f.endsWith('.jsonl'))
  : [];

describe.skipIf(files.length === 0)('реплей записей живых рук', () => {
  for (const file of files) {
    const raw = readFileSync(resolve(FIXTURES, file));
    const text = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    const { meta, frames } = parseRecording(text);
    const stats = replayRecording(meta, frames);

    it(`${file}: сводка`, () => {
      // таблица для тюнинга порогов — видна в выводе vitest
      console.table(
        Object.fromEntries(
          Object.entries(stats).map(([label, s]) => [
            label,
            { frames: s.frames, casts: JSON.stringify(s.casts), active: JSON.stringify(s.active), hints: JSON.stringify(s.hints) },
          ]),
        ),
      );
    });

    for (const g of GESTURES) {
      const s = stats[g];
      it.skipIf(!s)(`${file}: «${g}» распознаётся в своём сегменте`, () => {
        const hits = HOLD.includes(g) ? (s!.active[g] ?? 0) : (s!.casts[g] ?? 0);
        expect(hits).toBeGreaterThan(0);
      });
    }

    it.skipIf(!stats.none)(`${file}: без жестов — почти нет ложных кастов`, () => {
      const casts = Object.values(stats.none.casts).reduce((a, b) => a + (b ?? 0), 0);
      expect(casts).toBeLessThanOrEqual(1);
    });

    it.skipIf(!stats.lightning_low)(`${file}: молния ниже головы — подсказка про молнию`, () => {
      expect(stats.lightning_low.hints.lightning ?? 0).toBeGreaterThan(0);
      expect(stats.lightning_low.hints.shield ?? 0).toBe(0);
    });

    // сегменты надёжности (см. RECORDING_SCRIPT): переходы и движения без намерения не стреляют
    for (const seg of ['switch_fire_shield', 'switch_ice_lightning', 'pointer_idle', 'hand_out']) {
      it.skipIf(!stats[seg])(`${file}: «${seg}» — почти нет ложных кастов`, () => {
        const casts = Object.values(stats[seg].casts).reduce((a, b) => a + (b ?? 0), 0);
        expect(casts).toBeLessThanOrEqual(1);
      });
    }

    it.skipIf(!stats.shield_steady)(`${file}: неподвижный кулак — щит почти всё время поднят`, () => {
      const s = stats.shield_steady;
      expect((s.active.shield ?? 0) / s.frames).toBeGreaterThan(0.85);
    });

    it.skipIf(!stats.low_light)(`${file}: слабый свет — сводка`, () => {
      // порог не задан: сначала нужны реальные записи; таблица выше показывает, сколько кастов прошло
      expect(stats.low_light.frames).toBeGreaterThan(0);
    });

    it.skipIf(!stats.fireball_ring)(`${file}: согнутый безымянный — подсказка про огненный шар`, () => {
      expect(stats.fireball_ring.hints.fireball ?? 0).toBeGreaterThan(0);
    });
  }
});
