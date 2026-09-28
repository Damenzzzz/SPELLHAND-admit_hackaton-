# SPELLHAND — дуэль магов на жестах

Браузерная игра для Admit Hackathon (кейс «Motion»): заклинания кастуются жестами рук перед веб-камерой.

**Демо:** https://spellhand-ruddy.vercel.app (Chrome, нужна веб-камера)

## Локальный запуск

```bash
npm i        # postinstall скопирует wasm MediaPipe и скачает модель в public/mediapipe
npm run dev
```

`?dev=1` — скрытый dev-режим (клавиатура/мышь, отладка).

## Статус

- [x] Фаза 0 — каркас: камера, HandLandmarker (self-host), скелет рук поверх зеркального видео, FPS, калибровка, деплой
- [ ] Фаза 1 — распознавание жестов, бой, режим «ошибка», академия

## Стек

Vite · React · TypeScript · @mediapipe/tasks-vision · zustand · Vercel
