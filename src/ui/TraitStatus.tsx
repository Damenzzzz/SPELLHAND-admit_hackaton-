import type { Battle } from '../game/combat';
import { tr } from '../i18n';

type Tone = 'warn' | 'good' | 'info';

/** Текущее состояние особой механики противника: текст, полоска (0..1) и тон. */
export function traitState(battle: Battle): { text: string; bar?: number; tone: Tone; portrait: string } | null {
  const s = battle.trait;
  if (!s) return null;
  const t = battle.t;
  const d = s.def;
  const sec = (until: number) => ((until - t) / 1000).toFixed(1);

  if (d.kind === 'channeler') {
    if (s.channel) {
      return {
        text: tr('Он готовит сильную атаку — сбей её ветром!', 'He is preparing a strong attack — knock it out with wind!'),
        bar: Math.min(1, (t - s.channel.start) / (s.channel.end - s.channel.start)),
        tone: 'warn',
        portrait: 'enemy-channeling',
      };
    }
    if (s.stunned) {
      return {
        text: tr(`💫 Оглушён · ${sec(s.stunnedUntil)} с`, `💫 Stunned · ${sec(s.stunnedUntil)} s`),
        bar: (s.stunnedUntil - t) / d.stunMs,
        tone: 'good',
        portrait: 'enemy-stunned',
      };
    }
    return { text: tr('🌀 Копит силу — держи ветер наготове', '🌀 Gathers power — keep wind ready'), tone: 'info', portrait: '' };
  }

  if (d.kind === 'iceArmor') {
    if (s.armorUp) {
      const pct = Math.round(d.reduction * 100);
      return {
        text: tr(`🧊 Ледяная броня: −${pct}% урона · растопи огнём`, `🧊 Ice armor: −${pct}% damage · melt it with fire`),
        tone: 'info',
        portrait: 'enemy-armored',
      };
    }
    return {
      text: tr(`🔥 Броня растаяла — атакуй! · ${sec(s.armorBackAt)} с`, `🔥 Armor melted — attack! · ${sec(s.armorBackAt)} s`),
      bar: (s.armorBackAt - t) / d.meltMs,
      tone: 'good',
      portrait: 'enemy-melted',
    };
  }

  if (s.windup) {
    return {
      text: tr('⚔️ Выпад! Сожми кулак в последний миг — парируй', '⚔️ Lunge! Make a fist at the last moment — parry'),
      bar: Math.min(1, (t - s.windup.start) / (s.windup.end - s.windup.start)),
      tone: 'warn',
      portrait: 'enemy-channeling',
    };
  }
  if (s.strikeHitT > t) {
    return {
      text: tr('⚔️ Выпад летит — кулак перед самым ударом!', '⚔️ Lunge incoming — fist right before impact!'),
      bar: 1 - (s.strikeHitT - t) / d.travelMs,
      tone: 'warn',
      portrait: 'enemy-channeling',
    };
  }
  if (s.exposed) {
    return {
      text: tr(`🎯 Противник открыт! · ${sec(s.exposedUntil)} с`, `🎯 Opponent exposed! · ${sec(s.exposedUntil)} s`),
      bar: (s.exposedUntil - t) / d.exposedMs,
      tone: 'good',
      portrait: 'enemy-exposed',
    };
  }
  const pct = Math.round((1 - d.guardMul) * 100);
  return {
    text: tr(`🤺 В стойке: −${pct}% урона · парируй выпад`, `🤺 On guard: −${pct}% damage · parry the lunge`),
    tone: 'info',
    portrait: 'enemy-guarded',
  };
}

/** Панель механики рядом с противником: читается и без частиц/вспышек (режим «меньше эффектов»). */
export function TraitStatus({ battle }: { battle: Battle }) {
  const st = traitState(battle);
  if (!st) return null;
  return (
    <div className={`trait-status trait-${st.tone}`} role="status">
      <span>{st.text}</span>
      {st.bar !== undefined && (
        <div className="trait-bar" aria-hidden>
          <div className="trait-bar-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, st.bar))})` }} />
        </div>
      )}
    </div>
  );
}
