/**
 * Онлайн без собственного бэкенда: WebRTC P2P (Trystero), сигналинг через публичные
 * Nostr-релеи. Транспорт изолирован в src/net — для Supabase Realtime достаточно
 * заменить импорт на '@trystero-p2p/supabase' (API идентичен).
 */
export const APP_ID = 'spellhand-admit-hackathon-2026';
export const LOBBY_ROOM = 'lobby-v1';
export const MATCH_TIMEOUT_MS = 20000;
