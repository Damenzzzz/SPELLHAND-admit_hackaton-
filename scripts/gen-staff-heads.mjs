/**
 * Навершия посохов в 3D через TRELLIS.2 (Microsoft, MIT) на Hugging Face Spaces.
 * Концепт-арт (public/assets/images/staffs/*.webp) → верхние 42% (навершие; длинные
 * древки image-to-3D ломает) → preprocess → image_to_3d → extract_glb → scripts/.cache/heads/.
 * Древко и светящийся шар остаются процедурными (scripts/build-staffs.mjs).
 *
 *   node --env-file=.env scripts/gen-staff-heads.mjs staff_archmage staff_oak
 *
 * HF_TOKEN (бесплатный аккаунт) в .env — без него анонимная квота ZeroGPU ~2 мин в сутки.
 */
import { Client, handle_file } from '@gradio/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'scripts/.cache/heads');
mkdirSync(OUT, { recursive: true });

const ids = process.argv.slice(2);
if (!ids.length) {
  console.log('usage: node --env-file=.env scripts/gen-staff-heads.mjs staff_archmage [staff_oak …]');
  process.exit(1);
}

async function headImage(id) {
  const trimmed = await sharp(resolve(ROOT, `public/assets/images/staffs/${id}.webp`)).trim().toBuffer({ resolveWithObject: true });
  const h = Math.round(trimmed.info.height * 0.42);
  return sharp(trimmed.data)
    .extract({ left: 0, top: 0, width: trimmed.info.width, height: h })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const client = await Client.connect('microsoft/TRELLIS.2', process.env.HF_TOKEN ? { hf_token: process.env.HF_TOKEN } : {});
for (const id of ids) {
  const t0 = Date.now();
  try {
    await client.predict('/start_session', {}).catch(() => {});
    const img = new Blob([await headImage(id)], { type: 'image/png' });
    const pre = await client.predict('/preprocess_image', { input: handle_file(img) });
    await client.predict('/image_to_3d', { image: pre.data[0], seed: 7, resolution: '512' });
    const glb = await client.predict('/extract_glb', { decimation_target: 100000, texture_size: 1024 });
    const file = glb.data.find((d) => d?.url);
    const buf = Buffer.from(await (await fetch(file.url)).arrayBuffer());
    writeFileSync(resolve(OUT, `${id}_head.glb`), buf);
    console.log(`✓ ${id} ${(buf.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } catch (e) {
    console.log(`✗ ${id}: ${e?.message ?? e}`);
  }
}
process.exit(0);
