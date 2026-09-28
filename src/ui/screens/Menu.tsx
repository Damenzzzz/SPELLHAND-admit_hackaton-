import { ASSETS } from '../../game/data/assets';
import { setMusicOn } from '../../game/music';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

export function Menu() {
  const { go, openAcademy } = useGame();
  const learned = useSave((s) => s.learned.length);
  const unlocked = useSave((s) => s.unlocked);
  const musicOn = useSave((s) => s.musicOn ?? true);

  return (
    <ScreenShell className="menu">
      <CoinBadge />
      <DwellButton className="music-toggle" onSelect={() => setMusicOn(!musicOn, 'menu')}>
        {musicOn ? '🎵' : '🔇'}
      </DwellButton>
      <AssetImg src={ASSETS.logo} fallback="SPELLHAND" className="logo-img" alt="SPELLHAND" />
      <p className="menu-sub">Наведи указательный палец на кнопку и подержи</p>
      <nav className="menu-buttons">
        <DwellButton className="btn-primary" onSelect={() => go('campaign')}>
          ⚔️ Кампания <small>уровень {unlocked}/10</small>
        </DwellButton>
        <DwellButton onSelect={() => openAcademy(null)}>
          📖 Академия <small>изучено {learned}/6</small>
        </DwellButton>
        <DwellButton onSelect={() => go('online')}>🌐 Онлайн-дуэль</DwellButton>
        <DwellButton onSelect={() => go('shop')}>🛒 Магазин</DwellButton>
        <DwellButton onSelect={() => go('leaderboard')}>🏆 Лидерборд</DwellButton>
        <DwellButton onSelect={() => go('coach')}>📈 Тренер</DwellButton>
        <DwellButton onSelect={() => go('rush')}>⚡ Разминка</DwellButton>
        <DwellButton onSelect={() => go('daily')}>📅 Испытание дня</DwellButton>
        <DwellButton onSelect={() => go('calibration')}>🎯 Калибровка</DwellButton>
      </nav>
    </ScreenShell>
  );
}
