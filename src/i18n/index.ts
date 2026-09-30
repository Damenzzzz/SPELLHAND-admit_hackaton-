import { useSave } from '../store/saveStore';
import { EN } from './en';

export type Lang = 'ru' | 'en';

/** Язык читается из сохранения при каждом вызове — переключение действует сразу, без перезагрузки. */
export const lang = (): Lang => (useSave.getState().settings?.lang === 'en' ? 'en' : 'ru');
export const isEn = () => lang() === 'en';

/** Строка интерфейса в двух языках прямо в коде. */
export const tr = (ru: string, en: string) => (isEn() ? en : ru);

/** Перевод русской строки из данных по словарю (нет перевода — оригинал). */
export const tx = (ru: string) => (isEn() ? EN[ru] ?? ru : ru);

/** Форматирование чисел под язык интерфейса. */
export const num = (n: number, digits = 0) =>
  n.toLocaleString(isEn() ? 'en-US' : 'ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Данные игры (жесты, уровни, предметы…) остаются на русском. localize один раз обходит объект
 * и заменяет строковые поля, у которых есть перевод в словаре, на геттеры — текст берётся на языке
 * интерфейса в момент чтения.
 */
export function localize<T>(data: T, seen = new WeakSet<object>()): T {
  if (!data || typeof data !== 'object' || seen.has(data)) return data;
  seen.add(data);
  for (const key of Object.keys(data)) {
    const desc = Object.getOwnPropertyDescriptor(data, key);
    if (!desc || !('value' in desc)) continue;
    const v = desc.value as unknown;
    if (typeof v === 'string') {
      const en = EN[v];
      if (en !== undefined) {
        Object.defineProperty(data, key, { enumerable: true, configurable: true, get: () => (isEn() ? en : v) });
      }
    } else if (v && typeof v === 'object') localize(v, seen);
  }
  return data;
}

/** Число со словом: plural(5, ['волна', 'волны', 'волн'], ['wave', 'waves']) → «5 волн» / «5 waves». */
export function plural(n: number, ru: [string, string, string], en: [string, string]) {
  if (isEn()) return `${n} ${n === 1 ? en[0] : en[1]}`;
  const m10 = n % 10;
  const m100 = n % 100;
  const form = m10 === 1 && m100 !== 11 ? ru[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ru[1] : ru[2];
  return `${n} ${form}`;
}
