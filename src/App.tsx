import { useEffect, useRef, useState } from 'react';
import { initGame, type EditorTool, type GameApi } from './game/Game';
import './App.css';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameApiRef = useRef<GameApi | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editorEnabled, setEditorEnabled] = useState(false);
  const [editorTool, setEditorTool] = useState<EditorTool>('platform');
  const [blockRequired, setBlockRequired] = useState(2);

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
      setEditorTool(api.getEditorTool());
      setBlockRequired(api.getBlockRequired());
      return () => {
        gameApiRef.current = null;
        destroy();
      };
    }
  }, []);

  return (
    <div className="game-container">
      {editorEnabled && (
        <div className="sidebar">
          <div className="sidebar-title">Editor</div>
          <div className="sidebar-section">
            <button
              type="button"
              className={editorTool === 'platform' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('platform'));
              }}
            >
              Platform
            </button>
            <button
              type="button"
              className={editorTool === 'door' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('door'));
              }}
            >
              Door
            </button>
            <button
              type="button"
              className={editorTool === 'key' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('key'));
              }}
            >
              Key
            </button>
            <button
              type="button"
              className={editorTool === 'block' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('block'));
              }}
            >
              Block ({blockRequired}p)
            </button>
            <button
              type="button"
              className={editorTool === 'spawn' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('spawn'));
              }}
            >
              Spawn
            </button>
            <button
              type="button"
              className={editorTool === 'spike' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('spike'));
              }}
            >
              Spikes
            </button>
            <button
              type="button"
              className={editorTool === 'erase' ? 'active' : undefined}
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                setEditorTool(api.setEditorTool('erase'));
              }}
            >
              Erase
            </button>
            {editorTool === 'block' && (
              <>
                <button
                  type="button"
                  className={blockRequired === 1 ? 'active' : undefined}
                  onClick={() => {
                    const api = gameApiRef.current;
                    if (!api) return;
                    setBlockRequired(api.setBlockRequired(1));
                  }}
                >
                  1p
                </button>
                <button
                  type="button"
                  className={blockRequired === 2 ? 'active' : undefined}
                  onClick={() => {
                    const api = gameApiRef.current;
                    if (!api) return;
                    setBlockRequired(api.setBlockRequired(2));
                  }}
                >
                  2p
                </button>
                <button
                  type="button"
                  className={blockRequired === 3 ? 'active' : undefined}
                  onClick={() => {
                    const api = gameApiRef.current;
                    if (!api) return;
                    setBlockRequired(api.setBlockRequired(3));
                  }}
                >
                  3p
                </button>
                <button
                  type="button"
                  className={blockRequired === 4 ? 'active' : undefined}
                  onClick={() => {
                    const api = gameApiRef.current;
                    if (!api) return;
                    setBlockRequired(api.setBlockRequired(4));
                  }}
                >
                  4p
                </button>
              </>
            )}
          </div>
          <div className="sidebar-title">Level</div>
          <div className="sidebar-section">
            <button
              type="button"
              onClick={() => {
                importInputRef.current?.click();
              }}
            >
              Import File
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
              Copy JSON
            </button>
            <button
              type="button"
              onClick={() => {
                const api = gameApiRef.current;
                if (!api) return;
                downloadTextFile('level.json', api.exportLevel());
              }}
            >
              Download JSON
            </button>
            <button
              type="button"
              onClick={() => {
                gameApiRef.current?.clearLevel();
              }}
            >
              Clear Level
            </button>
          </div>
        </div>
      )}
      <div className="stage">
        <div className="hud">
          <button
            type="button"
            onClick={() => {
              const api = gameApiRef.current;
              if (!api) return;
              const enabled = api.toggleEditor();
              setEditorEnabled(enabled);
              if (enabled) {
                setEditorTool(api.getEditorTool());
                setBlockRequired(api.getBlockRequired());
              }
            }}
          >
            Editor: {editorEnabled ? 'On' : 'Off'}
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
            ? `EDITOR: Tool=${editorTool}. Drag to place (spawn: click). Right-click to delete.`
            : 'Connect up to 4 gamepads to play. Get everyone to the door.'}
        </div>
      </div>
    </div>
  );
}

export default App;
