import { useEffect, useRef, useState } from 'react';
import { initGame, type GameApi } from './game/Game';
import './App.css';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameApiRef = useRef<GameApi | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editorEnabled, setEditorEnabled] = useState(false);

  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
  };

  useEffect(() => {
    if (canvasRef.current) {
      const { destroy, api } = initGame(canvasRef.current);
      gameApiRef.current = api;
      setEditorEnabled(api.getEditorEnabled());
      return () => {
        gameApiRef.current = null;
        destroy();
      };
    }
  }, []);

  return (
    <div className="game-container">
      <div className="hud">
        <button
          type="button"
          onClick={() => {
            const api = gameApiRef.current;
            if (!api) return;
            setEditorEnabled(api.toggleEditor());
          }}
        >
          Editor: {editorEnabled ? 'On' : 'Off'}
        </button>
        <button
          type="button"
          onClick={() => {
            importInputRef.current?.click();
          }}
        >
          Import
        </button>
        <button
          type="button"
          onClick={() => {
            const api = gameApiRef.current;
            if (!api) return;
            const json = window.prompt('Paste Level JSON');
            if (!json) return;
            api.importLevel(json);
          }}
        >
          Paste JSON
        </button>
        <button
          type="button"
          onClick={() => {
            const api = gameApiRef.current;
            if (!api) return;
            gameApiRef.current?.clearLevel();
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={async () => {
            const api = gameApiRef.current;
            if (!api) return;
            try {
              await copyToClipboard(api.exportLevel());
            } catch {
              downloadTextFile('level.json', api.exportLevel());
            }
          }}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={() => {
            const api = gameApiRef.current;
            if (!api) return;
            downloadTextFile('level.json', api.exportLevel());
          }}
        >
          Download
        </button>
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const api = gameApiRef.current;
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!api || !file) return;
          const json = await file.text();
          api.importLevel(json);
        }}
      />
      <canvas ref={canvasRef} />
      <div className="instructions">
        {editorEnabled
          ? 'EDITOR: Drag to place, right-click to delete.'
          : 'Connect up to 4 gamepads to play.'}
      </div>
    </div>
  );
}

export default App;
