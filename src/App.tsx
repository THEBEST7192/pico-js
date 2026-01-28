import { useEffect, useRef } from 'react';
import { initGame } from './game/Game';
import './App.css';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const cleanup = initGame(canvasRef.current);
      return cleanup;
    }
  }, []);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} />
      <div className="instructions">
        Connect up to 4 gamepads to play!
      </div>
    </div>
  );
}

export default App;
