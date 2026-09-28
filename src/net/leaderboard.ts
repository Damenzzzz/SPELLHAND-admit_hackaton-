import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

/**
 * Глобальный лидерборд без своего бэкенда: каждый результат боя — подписанное событие
 * NIP-78 (kind 30078) на публичных Nostr-релеях с тегом игры. Ключ устройства создаётся
 * анонимно и хранится в localStorage (аналог anonymous sign-in). Античита нет (хакатон).
 */
const RELAYS = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.mostr.pub'];
const TAG = 'spellhand-lb-v1';
const KIND = 30078;
const SK_KEY = 'spellhand.nostr.sk';

export type ResultRow = {
  nickname: string;
  mode: 'campaign' | 'online' | 'ghost';
  level: number;
  won: boolean;
  accuracy: number;
  created_at: number;
};

export interface LeaderRow {
  pubkey: string;
  nickname: string;
  wins: number;
  games: number;
  accuracy: number;
  maxLevel: number;
  onlineWins: number;
  me: boolean;
}

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

function secretKey(): Uint8Array {
  try {
    const saved = localStorage.getItem(SK_KEY);
    if (saved && /^[0-9a-f]{64}$/.test(saved)) return fromHex(saved);
    const sk = generateSecretKey();
    localStorage.setItem(SK_KEY, toHex(sk));
    return sk;
  } catch {
    return generateSecretKey();
  }
}

let pool: SimplePool | null = null;
const getPool = () => (pool ??= new SimplePool());

export async function submitResult(r: Omit<ResultRow, 'created_at'>): Promise<void> {
  const sk = secretKey();
  const created_at = Math.floor(Date.now() / 1000);
  const event = finalizeEvent(
    {
      kind: KIND,
      created_at,
      tags: [
        ['d', `spellhand:${created_at}:${Math.random().toString(36).slice(2, 8)}`],
        ['t', TAG],
      ],
      content: JSON.stringify({ ...r, created_at }),
    },
    sk,
  );
  await Promise.any(getPool().publish(RELAYS, event));
}

function parse(content: string): ResultRow | null {
  try {
    const r = JSON.parse(content) as Partial<ResultRow>;
    const ok =
      typeof r.nickname === 'string' &&
      r.nickname.length <= 40 &&
      (r.mode === 'campaign' || r.mode === 'online' || r.mode === 'ghost') &&
      typeof r.level === 'number' &&
      r.level >= 0 &&
      r.level <= 10 &&
      typeof r.won === 'boolean' &&
      typeof r.accuracy === 'number' &&
      r.accuracy >= 0 &&
      r.accuracy <= 1;
    return ok ? (r as ResultRow) : null;
  } catch {
    return null;
  }
}

/** Топ-20 по победам, затем по средней точности. */
export async function fetchTop(limit = 20): Promise<LeaderRow[]> {
  const myPk = getPublicKey(secretKey());
  const events = await getPool().querySync(RELAYS, { kinds: [KIND], '#t': [TAG], limit: 500 }, { maxWait: 6000 });

  const byPk = new Map<string, { rows: ResultRow[]; last: number }>();
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const r = parse(e.content);
    if (!r) continue;
    const cur = byPk.get(e.pubkey) ?? { rows: [], last: 0 };
    cur.rows.push(r);
    cur.last = Math.max(cur.last, e.created_at);
    byPk.set(e.pubkey, cur);
  }

  const rows: LeaderRow[] = [...byPk.entries()].map(([pubkey, { rows: rs }]) => {
    const latest = rs.reduce((a, b) => (b.created_at > a.created_at ? b : a));
    return {
      pubkey,
      nickname: latest.nickname,
      wins: rs.filter((r) => r.won).length,
      games: rs.length,
      accuracy: rs.reduce((a, r) => a + r.accuracy, 0) / rs.length,
      maxLevel: Math.max(0, ...rs.filter((r) => r.mode === 'campaign' && r.won).map((r) => r.level)),
      onlineWins: rs.filter((r) => r.mode === 'online' && r.won).length,
      me: pubkey === myPk,
    };
  });

  return rows.sort((a, b) => b.wins - a.wins || b.accuracy - a.accuracy).slice(0, limit);
}
