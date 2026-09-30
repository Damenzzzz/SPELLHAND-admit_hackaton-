import { useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../../game/settings';
import { sfx, unlockAudio } from '../../game/sfx';
import { useGame } from '../../store/gameStore';
import { updateSave, useSave } from '../../store/saveStore';
import { resetSettings, updateSettings, useSettings } from '../../store/settingsStore';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { tr } from '../../i18n';

type Section = 'controls' | 'audio' | 'visuals';
const TABS: { id: Section; label: () => string }[] = [
  { id: 'controls', label: () => tr('✋ Управление', '✋ Controls') },
  { id: 'audio', label: () => tr('🎵 Звук', '🎵 Sound') },
  { id: 'visuals', label: () => tr('✨ Отображение', '✨ Display') },
];

function Setting({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="setting-row"><div className="setting-copy"><h2>{title}</h2><p>{description}</p></div><div className="setting-options">{children}</div></section>;
}

function Choice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return <DwellButton allowPointer pressed={selected} className={`setting-choice${selected ? ' setting-selected' : ''}`} onSelect={onSelect}>{children}</DwellButton>;
}

function Volume({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <div className="setting-volume" role="group" aria-label={label}>
    <DwellButton allowPointer disabled={value === 0} onSelect={() => onChange(Math.max(0, value - 10))}>−<span className="sr-only"> {tr('Уменьшить', 'Decrease')}: {label}</span></DwellButton>
    <div><output aria-label={label}>{value}%</output><progress value={value} max={100} aria-label={label} /></div>
    <DwellButton allowPointer disabled={value === 100} onSelect={() => onChange(Math.min(100, value + 10))}>+<span className="sr-only"> {tr('Увеличить', 'Increase')}: {label}</span></DwellButton>
  </div>;
}

export function Settings() {
  const go = useGame((s) => s.go);
  const settings = useSettings();
  const musicOn = useSave((s) => s.musicOn ?? true);
  const [section, setSection] = useState<Section>('controls');
  const [testCount, setTestCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const musicAudible = musicOn && settings.musicVolume > 0;

  return (
    <ScreenShell className="settings">
      <header className="settings-header"><div><p className="reward-eyebrow">{tr('Твоя магия · твои правила', 'Your magic · your rules')}</p><h1>{tr('Настройки', 'Settings')}</h1></div><span className="settings-saved">{tr('✓ Автосохранение', '✓ Autosave')}</span></header>
      <nav className="settings-tabs" aria-label={tr('Разделы настроек', 'Settings sections')}>
        {TABS.map((tab) => <Choice key={tab.id} selected={section === tab.id} onSelect={() => setSection(tab.id)}>{tab.label()}</Choice>)}
      </nav>
      <div className="settings-panel" ref={panel}>
        {section === 'controls' && <>
          <Setting title={tr('Управление меню', 'Menu controls')} description={tr('Выбери, как нажимать кнопки. Заклинания в бою выполняются жестами во всех режимах.', 'Choose how to press buttons. Spells are always cast with gestures in battle.')}>
            <Choice selected={settings.menuControl === 'gesture'} onSelect={() => updateSettings({ menuControl: 'gesture' })}>✋ {tr('Жесты', 'Gestures')}</Choice>
            <Choice selected={settings.menuControl === 'both'} onSelect={() => updateSettings({ menuControl: 'both' })}>✋ + 🖱️ {tr('Оба', 'Both')}</Choice>
            <Choice selected={settings.menuControl === 'pointer'} onSelect={() => updateSettings({ menuControl: 'pointer' })}>🖱️ {tr('Мышь / касание', 'Mouse / touch')}</Choice>
          </Setting>
          <Setting title={tr('Время наведения', 'Dwell time')} description={tr('Столько нужно держать палец над кнопкой. Дольше — меньше случайных нажатий.', 'How long to hold your finger over a button. Longer means fewer accidental presses.')}>
            {[{ value: 800, label: tr('Быстро · 0,8 с', 'Fast · 0.8 s') }, { value: 1200, label: tr('Обычно · 1,2 с', 'Normal · 1.2 s') }, { value: 1800, label: tr('Спокойно · 1,8 с', 'Relaxed · 1.8 s') }].map((o) => <Choice key={o.value} selected={settings.dwellMs === o.value} onSelect={() => updateSettings({ dwellMs: o.value })}>{o.label}</Choice>)}
          </Setting>
          <Setting title={tr('Чувствительность курсора', 'Cursor sensitivity')} description={tr('Высокая чувствительность помогает дотянуться до краёв экрана меньшим движением руки.', 'High sensitivity lets you reach the screen edges with smaller hand movements.')}>
            {[{ value: 1, label: tr('Низкая', 'Low') }, { value: 1.4, label: tr('Средняя', 'Medium') }, { value: 1.8, label: tr('Высокая', 'High') }].map((o) => <Choice key={o.value} selected={settings.pointerGain === o.value} onSelect={() => updateSettings({ pointerGain: o.value })}>{o.label}</Choice>)}
          </Setting>
          <Setting title={tr('Рука для курсора', 'Cursor hand')} description={tr('В режиме «Авто» указывает рука с более прямым указательным пальцем. Выбранная рука должна быть в кадре.', 'In “Auto” the hand with the straighter index finger points. The chosen hand must be in frame.')}>
            <Choice selected={settings.pointerHand === 'auto'} onSelect={() => updateSettings({ pointerHand: 'auto' })}>{tr('Авто', 'Auto')}</Choice>
            <Choice selected={settings.pointerHand === 'left'} onSelect={() => updateSettings({ pointerHand: 'left' })}>{tr('Левая', 'Left')}</Choice>
            <Choice selected={settings.pointerHand === 'right'} onSelect={() => updateSettings({ pointerHand: 'right' })}>{tr('Правая', 'Right')}</Choice>
          </Setting>
          <div className="settings-test">
            <div><b>{tr('Попробуй здесь', 'Try it here')}</b><p role="status">{testCount ? tr(`Получилось! Нажатий: ${testCount}`, `It works! Presses: ${testCount}`) : tr('Наведи палец или нажми, чтобы проверить выбранное управление.', 'Point or click to test the selected controls.')}</p></div>
            <DwellButton className="btn-primary" onSelect={() => setTestCount((n) => n + 1)}>✦ {tr('Проверить', 'Test')}</DwellButton>
          </div>
          <p className="settings-tip">{tr('Настройки всегда доступны мышью. Если рука не распознаётся, открой калибровку из главного меню.', 'Settings always work with a mouse. If your hand is not recognized, open calibration from the main menu.')}</p>
        </>}
        {section === 'audio' && <>
          <Setting title={tr('Фоновая музыка', 'Background music')} description={tr('Громкость мелодий в меню и во время боя.', 'Music volume in menus and battle.')}>
            <Volume label={tr('Громкость музыки', 'Music volume')} value={settings.musicVolume} onChange={(musicVolume) => { updateSettings({ musicVolume }); updateSave({ musicOn: true }); }} />
            <Choice selected={!musicAudible} onSelect={() => { updateSave({ musicOn: !musicAudible }); if (!musicAudible && settings.musicVolume === 0) updateSettings({ musicVolume: DEFAULT_SETTINGS.musicVolume }); }}>{musicAudible ? tr('🔇 Выключить', '🔇 Turn off') : tr('🎵 Включить', '🎵 Turn on')}</Choice>
          </Setting>
          <Setting title={tr('Звуки игры', 'Game sounds')} description={tr('Заклинания, попадания, щиты и нажатия кнопок.', 'Spells, hits, shields and button presses.')}>
            <Volume label={tr('Громкость эффектов', 'Effects volume')} value={settings.sfxVolume} onChange={(sfxVolume) => updateSettings({ sfxVolume })} />
            <Choice selected={settings.sfxVolume === 0} onSelect={() => updateSettings({ sfxVolume: settings.sfxVolume === 0 ? DEFAULT_SETTINGS.sfxVolume : 0 })}>{settings.sfxVolume === 0 ? tr('🔊 Включить', '🔊 Turn on') : tr('🔇 Выключить', '🔇 Turn off')}</Choice>
          </Setting>
          <div className="settings-test"><div><b>{tr('Проверка звука', 'Sound check')}</b><p>{tr('Короткий звук выбора с текущей громкостью эффектов.', 'A short select sound at the current effects volume.')}</p></div><DwellButton allowPointer disabled={settings.sfxVolume === 0} onSelect={() => { void unlockAudio()?.then(() => sfx.select()); }}>♪ {tr('Прослушать', 'Play')}</DwellButton></div>
          <p className="settings-tip">{tr('Если браузер ещё не разрешил звук, сначала кликни по странице или нажми любую клавишу.', 'If the browser has not allowed sound yet, click the page or press any key first.')}</p>
        </>}
        {section === 'visuals' && <>
          <Setting title="Язык · Language" description={tr('Язык интерфейса, подсказок и советов. Прогресс не меняется.', 'Language of the interface, hints and tips. Progress is kept.')}>
            <Choice selected={settings.lang === 'ru'} onSelect={() => updateSettings({ lang: 'ru' })}>🇷🇺 Русский</Choice>
            <Choice selected={settings.lang === 'en'} onSelect={() => updateSettings({ lang: 'en' })}>🇬🇧 English</Choice>
          </Setting>
          <Setting title={tr('Меньше эффектов', 'Fewer effects')} description={tr('Убирает тряску и вспышки щита, уменьшает частицы и отключает магическое свечение руки. Снаряды и подсказки остаются видимыми.', 'Removes shake and shield flashes, reduces particles and turns off the hand glow. Projectiles and hints stay visible.')}>
            <Choice selected={!settings.reducedEffects} onSelect={() => updateSettings({ reducedEffects: false })}>{tr('Все эффекты', 'All effects')}</Choice>
            <Choice selected={settings.reducedEffects} onSelect={() => updateSettings({ reducedEffects: true })}>{tr('Спокойный режим', 'Calm mode')}</Choice>
          </Setting>
          <Setting title={tr('3D-посох на камере', '3D staff on camera')} description={tr('Показывает экипированный посох в руке. Отключение снижает нагрузку; характеристики предмета продолжают действовать.', 'Shows the equipped staff in your hand. Turning it off saves performance; item stats still apply.')}>
            <Choice selected={settings.showStaff} onSelect={() => updateSettings({ showStaff: true })}>{tr('Показывать', 'Show')}</Choice>
            <Choice selected={!settings.showStaff} onSelect={() => updateSettings({ showStaff: false })}>{tr('Скрыть', 'Hide')}</Choice>
          </Setting>
          <div className="settings-info"><span aria-hidden="true">✦</span><div><h2>{tr('Комфорт без потери магии', 'Comfort without losing the magic')}</h2><p>{tr('Выбирай спокойный режим, если яркие эффекты отвлекают, и скрывай посох, если игра работает медленно.', 'Pick calm mode if bright effects distract you, and hide the staff if the game runs slowly.')}</p></div></div>
        </>}
      </div>
      <footer className="settings-footer"><p role="status">{notice ?? tr('Изменения сохраняются автоматически', 'Changes are saved automatically')}</p><div>
        <DwellButton allowPointer onSelect={() => { resetSettings(); setNotice(tr('Настройки восстановлены. Прогресс и достижения сохранены.', 'Settings restored. Progress and achievements are kept.')); }}>↺ {tr('По умолчанию', 'Defaults')}</DwellButton>
        <div className="settings-scroll" aria-label={tr('Прокрутка настроек', 'Settings scroll')}>
          <DwellButton allowPointer onSelect={() => panel.current?.closest('.shell-content')?.scrollBy({ top: -300 })}>↑<span className="sr-only"> {tr('Прокрутить вверх', 'Scroll up')}</span></DwellButton>
          <DwellButton allowPointer onSelect={() => panel.current?.closest('.shell-content')?.scrollBy({ top: 300 })}>↓<span className="sr-only"> {tr('Прокрутить вниз', 'Scroll down')}</span></DwellButton>
        </div>
        <DwellButton allowPointer className="btn-primary" onSelect={() => go('menu')}>🏠 {tr('В меню', 'Menu')}</DwellButton>
      </div></footer>
    </ScreenShell>
  );
}
