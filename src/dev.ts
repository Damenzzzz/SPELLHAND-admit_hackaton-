/** Скрытый dev-режим: ?dev=1 — клавиатура/мышь и отладочные панели. */
export const isDev = new URLSearchParams(location.search).get('dev') === '1';
