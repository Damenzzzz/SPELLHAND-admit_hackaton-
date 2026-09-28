import { dist, ramp, type FingerId, type HandFeatures } from '../vision/features';
import type { Constraint, GestureId, GestureTemplate } from './types';

// --- словарь для текстов ---
const NAME: Record<FingerId, { nom: string; acc: string }> = {
  thumb: { nom: 'Большой', acc: 'большой палец' },
  index: { nom: 'Указательный', acc: 'указательный палец' },
  middle: { nom: 'Средний', acc: 'средний палец' },
  ring: { nom: 'Безымянный', acc: 'безымянный палец' },
  pinky: { nom: 'Мизинец', acc: 'мизинец' },
};

// --- строительные блоки ограничений ---
const extended = (f: FingerId, weight = 1): Constraint => ({
  id: `${f}_extended`,
  weight,
  score: (h) => ramp(h.extension[f], 0.25, 0.75),
  label: `${NAME[f].nom} выпрямлен`,
  hint: `Выпрями ${NAME[f].acc}`,
  fingers: [f],
});

const curled = (f: FingerId, weight = 1, hint?: string): Constraint => ({
  id: `${f}_curled`,
  weight,
  score: (h) => ramp(h.extension[f], 0.75, 0.3),
  label: `${NAME[f].nom} согнут`,
  hint: hint ?? `Согни ${NAME[f].acc}`,
  fingers: [f],
});

const palmFacing = (weight = 1.2): Constraint => ({
  id: 'palm_facing',
  weight,
  score: (h) => ramp(h.palmFacing, 0.05, 0.5),
  label: 'Ладонь к камере',
  hint: 'Разверни ладонь к камере',
});

const openness = (h: HandFeatures) =>
  (h.extension.index + h.extension.middle + h.extension.ring + h.extension.pinky) / 4;

const twoHands: Constraint = {
  id: 'two_hands',
  weight: 2,
  score: (_h, ctx) => (ctx.other ? 1 : 0),
  label: 'Обе руки в кадре',
  hint: 'Нужны обе руки в кадре',
};

const thisOpen: Constraint = {
  id: 'hand_open',
  weight: 1,
  score: (h) => ramp(openness(h), 0.35, 0.75),
  label: 'Первая ладонь раскрыта',
  hint: 'Раскрой ладонь — выпрями все пальцы',
  fingers: ['index', 'middle', 'ring', 'pinky'],
};

const otherOpen: Constraint = {
  id: 'other_hand_open',
  weight: 1,
  score: (_h, ctx) => (ctx.other ? ramp(openness(ctx.other), 0.35, 0.75) : 0),
  label: 'Вторая ладонь раскрыта',
  hint: 'Раскрой вторую ладонь',
};

/** Расстояние между запястьями в размерах ладони. */
const wristGap = (h: HandFeatures, other: HandFeatures | null) =>
  other ? dist(h.pts[0], other.pts[0]) / ((h.palmSize + other.palmSize) / 2) : Infinity;

// --- шесть жестов ---
export const TEMPLATES: GestureTemplate[] = [
  {
    id: 'fireball',
    name: 'Огненный шар',
    icon: '🔥',
    hands: 1,
    poseText: 'Открытая ладонь к камере, все пальцы выпрямлены',
    pose: [
      extended('thumb', 0.6),
      extended('index'),
      extended('middle'),
      extended('ring'),
      extended('pinky'),
      palmFacing(),
    ],
    motion: {
      kind: 'push',
      howTo: 'Держи ладонь, чтобы зарядить, и толкни её к камере',
      weakHint: 'Толкни ладонь вперёд резче',
    },
    ghost: { ext: { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 }, facing: 1 },
  },
  {
    id: 'ice',
    name: 'Ледяные осколки',
    icon: '❄️',
    hands: 1,
    poseText: 'Указательный и средний выпрямлены и сведены, безымянный и мизинец согнуты',
    pose: [
      extended('index'),
      extended('middle'),
      curled('ring'),
      curled('pinky'),
      {
        id: 'index_middle_together',
        weight: 0.6,
        score: (h) => ramp(dist(h.pts[8], h.pts[12]) / h.palmSize, 0.6, 0.3),
        label: 'Указательный и средний вместе',
        hint: 'Сведи указательный и средний вместе',
        fingers: ['index', 'middle'],
      },
    ],
    motion: {
      kind: 'flickDown',
      howTo: 'Резко кивни кистью вниз — каждый кивок = осколок (до 3)',
      weakHint: 'Кивни кистью вниз резче',
    },
    ghost: { ext: { thumb: 0.3, index: 1, middle: 1, ring: 0, pinky: 0 }, facing: 1, fingersTogether: true },
  },
  {
    id: 'lightning',
    name: 'Молния',
    icon: '⚡',
    hands: 1,
    poseText: 'Только указательный палец вверх, рука выше головы',
    pose: [
      extended('index', 1.2),
      curled('middle', 1, 'Остальные пальцы сожми в кулак — средний не согнут'),
      curled('ring', 1, 'Остальные пальцы сожми в кулак — безымянный не согнут'),
      curled('pinky', 1, 'Остальные пальцы сожми в кулак — мизинец не согнут'),
      {
        id: 'hand_above_head',
        weight: 1.5,
        score: (h) => ramp(h.wristY, 0.5, 0.32),
        label: 'Рука выше головы',
        hint: 'Подними руку выше головы',
      },
      {
        id: 'index_up',
        weight: 0.6,
        score: (h) => ramp((h.pts[5].y - h.pts[8].y) / h.palmSize, 0.2, 0.7),
        label: 'Палец смотрит вверх',
        hint: 'Направь указательный палец вверх',
        fingers: ['index'],
      },
    ],
    motion: {
      kind: 'swipeDown',
      howTo: 'Быстро махни рукой вниз',
      weakHint: 'Махни вниз быстрее',
    },
    ghost: { ext: { thumb: 0.2, index: 1, middle: 0, ring: 0, pinky: 0 }, facing: 1, raised: true },
  },
  {
    id: 'wind',
    name: 'Порыв ветра',
    icon: '🌪️',
    hands: 2,
    poseText: 'Две открытые ладони на расстоянии друг от друга',
    pose: [
      twoHands,
      thisOpen,
      otherOpen,
      {
        id: 'hands_apart',
        weight: 1,
        score: (h, ctx) => ramp(wristGap(h, ctx.other), 1.4, 2.1),
        label: 'Руки разведены',
        hint: 'Разведи руки шире',
      },
    ],
    motion: {
      kind: 'swipeSide',
      howTo: 'Махни обеими руками в одну сторону одновременно',
      weakHint: 'Веди обе руки в одну сторону одновременно и быстрее',
    },
    ghost: { ext: { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 }, facing: 1, twoHands: 'apart' },
  },
  {
    id: 'heal',
    name: 'Исцеление',
    icon: '💚',
    hands: 2,
    poseText: 'Две раскрытые ладони рядом, запястья вместе',
    pose: [
      twoHands,
      thisOpen,
      otherOpen,
      {
        id: 'hands_together',
        weight: 1.5,
        score: (h, ctx) => ramp(wristGap(h, ctx.other), 1.9, 1.2),
        label: 'Ладони рядом',
        hint: 'Сведи ладони ближе друг к другу',
      },
    ],
    motion: {
      kind: 'hold',
      howTo: 'Держи позу — лечение идёт, пока держишь (щит в это время недоступен)',
      weakHint: 'Держи ладони вместе дольше',
    },
    ghost: { ext: { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 }, facing: 1, twoHands: 'together' },
  },
  {
    id: 'shield',
    name: 'Щит',
    icon: '🛡️',
    hands: 1,
    poseText: 'Кулак, пальцами к камере',
    pose: [
      curled('index', 1, 'Сожми кулак плотнее — указательный не согнут'),
      curled('middle', 1, 'Сожми кулак плотнее — средний не согнут'),
      curled('ring', 1, 'Сожми кулак плотнее — безымянный не согнут'),
      curled('pinky', 1, 'Сожми кулак плотнее — мизинец не согнут'),
      curled('thumb', 0.5, 'Прижми большой палец к кулаку'),
      { ...palmFacing(1), label: 'Кулак пальцами к камере', hint: 'Разверни кулак пальцами к камере' },
    ],
    motion: {
      kind: 'hold',
      howTo: 'Держи кулак — щит поднят, пока держишь',
      weakHint: 'Держи кулак ровно',
    },
    ghost: { ext: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, facing: 1 },
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t])) as Record<
  GestureId,
  GestureTemplate
>;
