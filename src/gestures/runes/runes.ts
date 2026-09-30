import { prepare, type Pt, type RuneTemplate } from './pdollar';
import { localize } from '../../i18n';

export type RuneId = 'meteor' | 'chain' | 'prison' | 'sphere' | 'mend';

export interface RuneDef {
  id: RuneId;
  name: string;
  /** Символ фигуры для подсказок. */
  glyph: string;
  /** Как рисовать. */
  howTo: string;
  effect: string;
  color: string;
}

/** Ультимейты — рисуются «пером» (сведённые большой + указательный) в воздухе. */
export const RUNES: Record<RuneId, RuneDef> = {
  meteor: { id: 'meteor', name: 'Метеор', glyph: '△', howTo: 'Треугольник', effect: '50 урона огнём', color: '#ff7a2f' },
  chain: { id: 'chain', name: 'Цепная молния', glyph: 'Z', howTo: 'Зигзаг «Z»', effect: '35 урона сквозь щит', color: '#e9e45b' },
  prison: { id: 'prison', name: 'Ледяная тюрьма', glyph: 'V', howTo: 'Галочка «V»', effect: 'враг заморожен 4 с', color: '#8fe3ff' },
  sphere: { id: 'sphere', name: 'Сфера', glyph: '○', howTo: 'Круг', effect: 'щит полностью восстановлен', color: '#7fa8ff' },
  mend: { id: 'mend', name: 'Возрождение', glyph: '@', howTo: 'Спираль внутрь', effect: '+35 HP за 3 с', color: '#5dff8f' },
};

// --- эталонные фигуры (экранные координаты: y вниз) ---
const poly = (vs: Pt[], perSide = 12): Pt[] =>
  vs.slice(0, -1).flatMap((a, i) => {
    const b = vs[i + 1];
    return Array.from({ length: perSide }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / perSide, y: a.y + ((b.y - a.y) * k) / perSide }));
  });

const circle = (turns = 1, spiral = 0): Pt[] =>
  Array.from({ length: 64 }, (_, i) => {
    const t = i / 63;
    const a = -Math.PI / 2 + t * turns * Math.PI * 2;
    const r = 1 - spiral * t;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });

const SHAPES: Record<RuneId, Pt[][]> = {
  meteor: [
    poly([{ x: 0, y: -1 }, { x: 0.9, y: 0.7 }, { x: -0.9, y: 0.7 }, { x: 0, y: -1 }]),
    poly([{ x: -0.9, y: 0.7 }, { x: 0, y: -1 }, { x: 0.9, y: 0.7 }, { x: -0.9, y: 0.7 }]),
  ],
  chain: [poly([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }])],
  prison: [poly([{ x: -1, y: -1 }, { x: 0, y: 1 }, { x: 1, y: -1 }], 16)],
  sphere: [circle(1), circle(1).reverse()],
  mend: [circle(2, 0.8), circle(2, 0.8).map((p) => ({ x: -p.x, y: p.y }))],
};

/**
 * В воздухе фигуру почти никогда не замыкают идеально, а обрезка дрожания пера съедает
 * ещё по кусочку с концов — поэтому к каждому эталону добавлен «недорисованный» вариант.
 */
const OPEN_FRACTION = 0.88;

export const RUNE_TEMPLATES: RuneTemplate<RuneId>[] = (Object.entries(SHAPES) as [RuneId, Pt[][]][]).flatMap(
  ([id, variants]) =>
    variants.flatMap((v) => [
      { id, points: prepare(v) },
      { id, points: prepare(v.slice(0, Math.round(v.length * OPEN_FRACTION))) },
    ]),
);

/** Точки эталона для отрисовки подсказки (первый вариант). */
export const runeShape = (id: RuneId): Pt[] => SHAPES[id][0];

localize(RUNES);
