/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { initGame } from './gameLogic';

export default function App() {
  useEffect(() => {
    const cleanup = initGame();
    return () => {
      cleanup();
    };
  }, []);

  return (
    <>
      <div id="game-container"></div>
      <div id="damage-overlay"></div>

      {/* Мобильные элементы управления */}
      <div id="mobile-controls">
          <div id="joystick-base" className="touch-btn">
              <div id="joystick-knob"></div>
          </div>
          <div id="btn-shoot" className="touch-btn">ОГОНЬ</div>
          <div id="btn-sprint" className="touch-btn">БЕГ</div>
          <div id="btn-pause" className="touch-btn">ПАУЗА</div>
      </div>

      <div id="ui-layer">
          <div id="minimap-container">
              <canvas id="minimap"></canvas>
          </div>
          <div className="hud-stats">
              <div id="health" className="hud-stat">ЗДОРОВЬЕ: 300</div>
              <div id="ammo" className="hud-stat">ПАТРОНЫ: 100</div>
          </div>
          <div className="hud-message">
              <div id="message"></div>
          </div>
          <div id="crosshair"></div>
      </div>

      <div id="start-screen">
          <h1 id="start-title">КОМПЛЕКС</h1>
          <p id="start-desc">Они сливаются с темнотой. Они ждут, пока вы подойдете ближе.<br/>Осветите их, и они нападут.<br/><br/>Найдите синюю ключ-карту и доберитесь до выхода.</p>
          
          <div id="btn-start" className="start-btn disabled" style={{marginTop: '15px', fontSize: '16px', padding: '12px 30px', background: 'rgba(0, 255, 170, 0.1)', borderColor: 'rgba(0, 255, 170, 0.3)'}}>ИГРАТЬ</div>
          <p id="controls-desc" style={{ fontSize: '12px', marginTop: '20px', color: '#666' }}>Подождите, идет загрузка 3D моделей (20 МБ)</p>
      </div>
    </>
  );
}
