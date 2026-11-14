import { useEffect } from 'react';
import { isTyping } from '../canvas/Canvas';
import { useReducedMotion } from '../viz/useReducedMotion';
import { useLayout } from '../workspace/layout-store';
import { useMentorUi } from './mentor-api';

function toggleChat() {
  const opening = useLayout.getState().collapsed.chat;
  useLayout.getState().toggle('chat');
  if (opening) useMentorUi.getState().set({ unread: null });
  requestAnimationFrame(() => {
    document.getElementById(opening ? 'mentor-input' : 'mentor-launcher')?.focus();
  });
}

/**
 * The closed chat: a pill on the canvas (gone while the chat is open), a dot while the mentor answers, and
 * the first line of a reply that arrived meanwhile. `M` opens and closes it
 * outside text fields (study-mode FR-3).
 */
export function MentorLauncher() {
  const open = useLayout((s) => !s.collapsed.chat);
  const streaming = useMentorUi((s) => s.streaming);
  const unread = useMentorUi((s) => s.unread);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target))
        return;
      e.preventDefault();
      toggleChat();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Open, the panel has its own "Fechar": the canvas stays clear (M still toggles).
  if (open) return null;

  return (
    <div className="mentor-launcher-wrap">
      {unread !== null && (
        <button type="button" className="mentor-unread" role="status" onClick={toggleChat}>
          {unread}
        </button>
      )}
      <button
        id="mentor-launcher"
        type="button"
        className="button mentor-launcher"
        aria-expanded={false}
        aria-controls="mentor-chat"
        aria-keyshortcuts="M"
        title="Mentor (M)"
        onClick={toggleChat}
      >
        {streaming && (
          <span
            className={`mentor-dot${reduced ? '' : ' pulsing'}`}
            aria-label="o mentor está respondendo"
          />
        )}
        Abrir mentor
      </button>
    </div>
  );
}
