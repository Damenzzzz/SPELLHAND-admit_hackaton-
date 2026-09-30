import { afterEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, MAGE_RANKS } from '../game/achievements';
import { COMBOS } from '../game/data/combos';
import { GRADES } from '../game/data/grades';
import { adviceFor } from '../game/data/hints';
import { SHIELDS, STAFFS } from '../game/data/items';
import { GHOST_LEVEL, LEVELS } from '../game/data/levels';
import { MODIFIERS } from '../game/data/modifiers';
import { SPELLS } from '../game/data/spells';
import { survivalLevel } from '../game/data/survival';
import { RUNES } from '../gestures/runes/runes';
import { TEMPLATES } from '../gestures/templates';
import { useSave } from '../store/saveStore';
import { updateSettings } from '../store/settingsStore';
import { FAIL_BADGE } from '../ui/failCategories';
import { localize, plural, tr } from '.';

const initial = useSave.getState();
afterEach(() => useSave.setState(initial, true));

const CYRILLIC = /[А-Яа-яЁё]/;

/** Все строки объекта (глубоко), кроме функций. */
function strings(v: unknown, out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object' && !seen.has(v)) {
    seen.add(v);
    for (const x of Object.values(v)) strings(x, out, seen);
  }
  return out;
}

const DATA = { ACHIEVEMENTS, MAGE_RANKS, COMBOS, GRADES, STAFFS, SHIELDS, LEVELS, GHOST_LEVEL, MODIFIERS, SPELLS, RUNES, TEMPLATES, FAIL_BADGE };

describe('локализация', () => {
  it('по умолчанию интерфейс на русском', () => {
    expect(tr('Бой', 'Fight')).toBe('Бой');
    expect(TEMPLATES[0].name).toBe('Огненный шар');
  });

  it('в английском режиме в данных игры не остаётся русского текста', () => {
    updateSettings({ lang: 'en' });
    for (const [name, data] of Object.entries(DATA)) {
      const left = strings(data).filter((s) => CYRILLIC.test(s));
      expect(left, name).toEqual([]);
    }
    expect(survivalLevel(3).name).toBe('Wave 3');
    expect(adviceFor('ring_extended')).toContain('ring finger');
  });

  it('переключение языка действует сразу, без перезагрузки', () => {
    updateSettings({ lang: 'en' });
    expect(SPELLS.fireball.name).toBe('Fireball');
    updateSettings({ lang: 'ru' });
    expect(SPELLS.fireball.name).toBe('Огненный шар');
  });

  it('копия объекта через spread берёт текст на текущем языке', () => {
    updateSettings({ lang: 'en' });
    expect({ ...LEVELS[0] }.enemyName).toBe('Renegade Apprentice');
    const own = localize({ label: 'Щит', id: 'shield' });
    expect(own.label).toBe('Shield');
    expect(own.id).toBe('shield');
  });

  it('склонения по числам', () => {
    expect(plural(1, ['волна', 'волны', 'волн'], ['wave', 'waves'])).toBe('1 волна');
    expect(plural(3, ['волна', 'волны', 'волн'], ['wave', 'waves'])).toBe('3 волны');
    expect(plural(12, ['волна', 'волны', 'волн'], ['wave', 'waves'])).toBe('12 волн');
    expect(plural(21, ['волна', 'волны', 'волн'], ['wave', 'waves'])).toBe('21 волна');
    updateSettings({ lang: 'en' });
    expect(plural(1, ['волна', 'волны', 'волн'], ['wave', 'waves'])).toBe('1 wave');
    expect(plural(5, ['волна', 'волны', 'волн'], ['wave', 'waves'])).toBe('5 waves');
  });
});
