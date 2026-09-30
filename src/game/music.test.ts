import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class TestAudio {
  static all: TestAudio[] = [];
  volume = 0;
  paused = true;
  loop = false;
  preload = '';
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  constructor(public src: string) { TestAudio.all.push(this); }
}
let frames: Map<number, FrameRequestCallback>;
let now: number;
let nextFrame: number;
let events: EventTarget;
const flush = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((f) => f(now)); };

beforeEach(() => {
  vi.resetModules();
  TestAudio.all = [];
  frames = new Map(); now = 0; nextFrame = 0;
  events = new EventTarget();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('Audio', TestAudio);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frames.set(++nextFrame, f); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('громкость и переключение музыки', () => {
  it('меняет громкость текущего трека и сразу отключает звук при нуле', async () => {
    const { useSave } = await import('../store/saveStore');
    const { playMusic } = await import('./music');
    playMusic('menu'); await Promise.resolve(); now = 1000; flush();
    expect(TestAudio.all[0].volume).toBeCloseTo(0.28);
    useSave.setState({ settings: { musicVolume: 60 } });
    playMusic('menu');
    expect(TestAudio.all[0].volume).toBe(0.6);
    useSave.setState({ settings: { musicVolume: 0 } });
    playMusic('menu');
    expect(TestAudio.all[0].volume).toBe(0);
    expect(TestAudio.all[0].paused).toBe(true);
  });
  it('отменяет старое затухание при быстром возвращении к треку', async () => {
    const { playMusic } = await import('./music');
    playMusic('menu'); await Promise.resolve(); now = 1000; flush();
    playMusic('battle'); await Promise.resolve();
    playMusic('menu'); await Promise.resolve(); now = 2000; flush();
    expect(TestAudio.all[0].paused).toBe(false);
    expect(TestAudio.all[0].volume).toBeCloseTo(0.28);
    expect(TestAudio.all[1].paused).toBe(true);
  });
  it('ожидающий разрешения браузера трек не запускается после выключения музыки', async () => {
    const { useSave } = await import('../store/saveStore');
    const { playMusic } = await import('./music');
    // Seed the element, then simulate an autoplay rejection on the next attempt.
    playMusic('menu'); await Promise.resolve();
    const a = TestAudio.all[0];
    playMusic(null);
    a.play.mockRejectedValueOnce(new Error('autoplay blocked'));
    playMusic('menu'); await Promise.resolve();
    useSave.setState({ musicOn: false });
    playMusic('menu');
    const calls = a.play.mock.calls.length;
    events.dispatchEvent(new Event('pointerdown'));
    expect(a.play).toHaveBeenCalledTimes(calls);
    expect(a.paused).toBe(true);
  });
});
