# SPELLHAND — стиль-библия ассетов

Единый стиль для всех генераций (Nano Banana 2, `gemini-3.1-flash-image` через Vertex AI).
Первое изображение манифеста (`menu_bg`) — эталон: передаётся референсом во все следующие запросы.

## Стиль (добавляется к каждому промпту)

stylized hand-painted fantasy game art, painterly brush texture, dark navy and deep arcane blue palette
with warm gold accents, soft rim light, glowing magical highlights, clean readable silhouette,
cohesive mobile game asset style, high detail

## Негатив

no text, no letters, no watermark, no signature, no frame, no border, no UI elements,
no photorealism, no 3D render look, no blur, no cropped subject

## Фоны

- `scene` — полноценная сцена 16:9 (арены, фон меню). Центр оставлять свободным под бой.
- `chroma` — объект на сплошном #00FF00, без теней на фоне; хромакей вырезается `sharp` в `gen-images.ts`.
- `black` — светящийся объект на чистом чёрном (руны щитов, рисуются аддитивно).
