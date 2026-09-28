/**
 * Генерация 2D-ассетов по scripts/assets.manifest.json через Nano Banana 2
 * (gemini-3.1-flash-image, ключ Vertex AI Express из .env — в клиент не попадает).
 *
 *   node --env-file=.env scripts/gen-images.ts            # всё со status != done
 *   node --env-file=.env scripts/gen-images.ts --only logo,enemy_1 --force
 *   node scripts/gen-images.ts --reprocess                 # только пересобрать webp из кэша
 */
import { GoogleGenAI } from '@google/genai';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

interface Asset {
  id: string;
  type: 'image';
  bg: 'scene' | 'chroma' | 'black';
  aspect: string;
  size: [number, number];
  out: string;
  prompt: string;
  status: 'todo' | 'done' | 'error';
}

interface Manifest {
  model: string;
  styleRef: string;
  assets: Asset[];
}

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST = resolve(ROOT, 'scripts/assets.manifest.json');
const CACHE = resolve(ROOT, 'scripts/.cache');
const CONCURRENCY = 3;

const STYLE =
  'Style: stylized hand-painted fantasy game art, painterly brush texture, dark navy and deep arcane blue palette ' +
  'with warm gold accents, soft rim light, glowing magical highlights, clean readable silhouette, cohesive game asset style, high detail.';
const NEGATIVE =
  'Avoid: text, letters, watermark, signature, frame, border, UI elements, photorealism, 3D render look, blur, cropped subject.';
const BG: Record<Asset['bg'], string> = {
  scene: 'Full-bleed scene filling the whole frame.',
  chroma:
    'Isolated subject on a perfectly flat solid pure green (#00FF00) background, no shadows or gradients on the background, no green on the subject, the whole subject inside the frame with margin.',
  black: 'Glowing subject on a pure solid black background.',
};

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const force = args.includes('--force');
const reprocessOnly = args.includes('--reprocess');

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const saveManifest = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
mkdirSync(CACHE, { recursive: true });

const rawPath = (id: string) => resolve(CACHE, `${id}.png`);

/** Хромакей: зелёный фон → прозрачность, с мягким краем и подавлением зелёного ореола. */
async function chromaKey(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const spill = g - Math.max(r, b);
    if (g > 90 && spill > 60) {
      // уверенный фон → 0, пограничные пиксели → частичная прозрачность
      data[i + 3] = spill > 110 ? 0 : Math.round(255 * (1 - (spill - 60) / 50));
    }
    if (spill > 0) data[i + 1] = Math.max(r, b);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function processAsset(a: Asset, raw: Buffer) {
  const out = resolve(ROOT, a.out);
  mkdirSync(dirname(out), { recursive: true });
  const [w, h] = a.size;
  if (a.bg === 'chroma') {
    const keyed = await chromaKey(raw);
    await sharp(keyed)
      .trim({ threshold: 1 })
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, alphaQuality: 90 })
      .toFile(out);
  } else {
    await sharp(raw).resize(w, h, { fit: 'cover' }).webp({ quality: a.bg === 'scene' ? 78 : 85 }).toFile(out);
  }
}

async function generate(ai: GoogleGenAI, a: Asset, ref: Buffer | null): Promise<Buffer> {
  const text = [a.prompt + '.', STYLE, BG[a.bg], a.id === 'logo' ? '' : NEGATIVE].join(' ');
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (ref) {
    parts.push({ inlineData: { mimeType: 'image/png', data: ref.toString('base64') } });
    parts.push({
      text: 'Match the art style, brushwork, lighting and rendering of the reference image. Do not copy its content, and keep the subject\'s own natural colors (fire is orange, ice is cyan, nature is green).',
    });
  }
  parts.push({ text });

  const res = await ai.models.generateContent({
    model: manifest.model,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: a.aspect } },
  });
  const img = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) throw new Error(`no image in response (${res.candidates?.[0]?.finishReason})`);
  return Buffer.from(img.inlineData.data, 'base64');
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function main() {
  const selected = manifest.assets.filter(
    (a) => (!only || only.includes(a.id)) && (force || reprocessOnly || a.status !== 'done'),
  );

  if (reprocessOnly) {
    for (const a of selected) {
      if (!existsSync(rawPath(a.id))) continue;
      await processAsset(a, readFileSync(rawPath(a.id)));
      console.log('reprocessed', a.id);
    }
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не задан (запускай с --env-file=.env)');
  // ключ формата AQ.* — Vertex AI Express
  const ai = new GoogleGenAI(apiKey.startsWith('AQ.') ? { vertexai: true, apiKey } : { apiKey });

  const refAsset = manifest.assets.find((a) => a.id === manifest.styleRef)!;
  let ref: Buffer | null = existsSync(rawPath(refAsset.id)) ? readFileSync(rawPath(refAsset.id)) : null;

  const run = async (a: Asset) => {
    const t0 = Date.now();
    try {
      const raw = await withRetry(() => generate(ai, a, a.id === refAsset.id ? null : ref));
      writeFileSync(rawPath(a.id), raw);
      await processAsset(a, raw);
      a.status = 'done';
      console.log(`✓ ${a.id} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      return raw;
    } catch (e) {
      a.status = 'error';
      console.log(`✗ ${a.id}: ${String((e as Error).message).slice(0, 200)}`);
      return null;
    } finally {
      saveManifest();
    }
  };

  // эталон стиля генерируется первым и идёт референсом во все остальные
  const queue = selected.filter((a) => a.id !== refAsset.id);
  if (selected.includes(refAsset)) ref = (await run(refAsset)) ?? ref;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let a = queue.shift(); a; a = queue.shift()) await run(a);
  });
  await Promise.all(workers);
}

await main();
