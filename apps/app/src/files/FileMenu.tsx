import { useRef, useState } from 'react';
import { useDiagram } from '../store/diagram-store';
import { downloadDiagram, readDiagramFile } from './save-open';

export function FileMenu() {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="file-menu">
      <button
        type="button"
        className="button"
        onClick={() => {
          downloadDiagram(useDiagram.getState().diagram);
        }}
      >
        Salvar arquivo
      </button>
      <button
        type="button"
        className="button"
        onClick={() => {
          input.current?.click();
        }}
      >
        Abrir arquivo
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.archsim.json,application/json"
        hidden
        aria-label="Arquivo de diagrama"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void readDiagramFile(file).then((r) => {
            if (!r.ok) {
              setError(r.message);
              return;
            }
            setError(null);
            const s = useDiagram.getState();
            // In a problem, the problem's load always wins over the file's (FR-44).
            s.replaceDiagram(
              s.mode.kind === 'problem' ? { ...r.diagram, load: s.diagram.load } : r.diagram,
            );
          });
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          Não consegui abrir o arquivo: {error}
        </p>
      )}
    </div>
  );
}
