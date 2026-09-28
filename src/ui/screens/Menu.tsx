import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

export function Menu() {
  const { go, openAcademy } = useGame();
  const learned = useSave((s) => s.learned.length);
  const unlocked = useSave((s) => s.unlocked);

  return (
    <ScreenShell className="menu">
      <CoinBadge />
      <h1 className="logo">SPELLHAND</h1>
      <p className="menu-sub">Наведи указательный палец на кнопку и подержи</p>
      <nav className="menu-buttons">
        <DwellButton className="btn-primary" onSelect={() => go('campaign')}>
          ⚔️ Кампания <small>уровень {unlocked}/10</small>
        </DwellButton>
        <DwellButton onSelect={() => openAcademy(null)}>
          📖 Академия <small>изучено {learned}/6</small>
        </DwellButton>
        <DwellButton onSelect={() => go('shop')}>🛒 Магазин</DwellButton>
        <DwellButton onSelect={() => go('calibration')}>🎯 Калибровка</DwellButton>
      </nav>
    </ScreenShell>
  );
}
