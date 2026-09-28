import { CameraView } from '../../render/CameraView';
import { FpsCounter } from '../FpsCounter';

/** Полигон: полноэкранный трекинг обеих рук (приёмка Фазы 0). */
export function Sandbox() {
  return (
    <CameraView className="sandbox">
      <FpsCounter />
      <div className="sandbox-caption">
        <span className="logo logo-xs">SPELLHAND</span>
        <span>Покажи обе руки — скоро здесь появятся заклинания</span>
      </div>
    </CameraView>
  );
}
