/** Все пороги распознавания в одном месте (тюнинг — через dev-панель ?dev=1). */
export const GESTURE_CONFIG = {
  /** Поза распознана, если score ≥ этого порога… */
  recognize: 0.85,
  /**
   * …стабильно не меньше armMs и не меньше minStableFrames кадров. По времени, а не по числу
   * кадров: на 30 FPS это те же 5 кадров, что и раньше; на 60 FPS мимолётная поза (~80 мс) при
   * смене жестов больше не взводится, на 8–10 FPS поза не ждёт полсекунды.
   */
  armMs: 130,
  minStableFrames: 3,
  /** Поза «отпускается», когда score ниже этого не меньше releaseFrames кадров и releaseMs. */
  release: 0.7,
  releaseFrames: 3,
  releaseMs: 60,
  /** После потери позы ещё столько мс принимаем движение (рывок смазывает позу). */
  motionGraceMs: 350,

  /** Near-miss: лучший шаблон в [nearMiss; recognize) дольше nearMissMs. */
  nearMiss: 0.55,
  nearMissMs: 400,
  /** Сколько ограничений показывать в подсказке. */
  hintCount: 2,
  /** Ограничение считается проваленным ниже этого score. */
  constraintFail: 0.7,

  // --- движение (скорости в размерах ладони в секунду) ---
  historyFrames: 15,
  pushGrowth: 0.15,
  pushWeak: 0.07,
  pushWindowMs: 250,
  swipeDown: 7,
  swipeDownWeak: 3.5,
  flickDown: 6,
  flickDownWeak: 3,
  swipeSide: 5,
  swipeSideWeak: 2.5,
  velocityWindowMs: 150,
  /**
   * Провал кадров (воркер занят, просадка FPS): если в окне скорости нет второго сэмпла,
   * берём предыдущий, когда он не старше этого. Иначе скорость = 0 и взмах теряется.
   */
  maxSampleGapMs: 300,
  /** Сколько ждём полноценного движения после слабого, прежде чем засчитать осечку. */
  weakResolveMs: 300,
  /** Пауза между осколками льда. */
  flickRefractoryMs: 280,
  maxShards: 3,
  /** После каста шаблон заблокирован, чтобы не срабатывал повторно тем же движением. */
  castLockMs: 500,

  // --- контекст ---
  /** palmSize в долях высоты кадра. */
  tooClose: 0.42,
  tooFar: 0.07,
  lowBrightness: 45,

  /** Заряд огненного шара: от holdMin до holdMax удержания. */
  chargeMinMs: 500,
  chargeMaxMs: 1500,
  /** Дольше — перезаряд: шар взрывается в руке. */
  overchargeMs: 2300,
};
