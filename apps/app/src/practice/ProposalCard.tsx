import { catalog } from '@archsim/catalog';
import type { Proposal, ProposalStatus } from '@archsim/problems';
import type { Diagram } from '@archsim/sim-engine';
import { useEffect, useState } from 'react';
import { useDiagram } from '../store/diagram-store';
import { applyProposal, describeOp, proposalNodeId } from '../store/proposal';
import { ApiError } from './api';
import { mentorApi, useMentorUi } from './mentor-api';

const STALE = 'O desenho mudou desde esta proposta; peça de novo ao mentor.';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'proposta',
  applied: 'aplicada',
  discarded: 'descartada',
};

/**
 * A mentor's proposal in the chat: what changes, in the names on screen, and
 * nothing happens until the person clicks Aplicar. Applied as one undo step;
 * Desfazer shows while nothing else changed since (mentor-edits FR-3–FR-9).
 */
export function ProposalCard({
  problemId,
  proposal,
  onChange,
}: {
  problemId: string;
  proposal: Proposal;
  onChange: (proposal: Proposal) => void;
}) {
  const diagram = useDiagram((s) => s.diagram);
  const streaming = useMentorUi((s) => s.streaming);
  // The diagrams around the last Aplicar: kept through undo, so a redo is recognised (M1).
  const [applied, setApplied] = useState<Diagram | null>(null);
  const [before, setBefore] = useState<Diagram | null>(null);
  // A status the server refused while a reply was streaming, sent again when it ends (M2).
  const [unsynced, setUnsynced] = useState<ProposalStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = (status: ProposalStatus) => {
    mentorApi.proposalStatus(problemId, proposal.id, status).then(
      () => {
        setUnsynced(null);
      },
      (e: unknown) => {
        if (e instanceof ApiError && e.message.includes('em andamento')) {
          setUnsynced(status);
          return;
        }
        setNote(
          e instanceof ApiError
            ? `Não consegui guardar o estado da proposta: ${e.message}`
            : 'Não consegui guardar o estado da proposta.',
        );
      },
    );
  };

  const setStatus = (status: ProposalStatus) => {
    onChange({ ...proposal, status });
    save(status);
  };

  useEffect(() => {
    if (!streaming && unsynced !== null) save(unsynced);
    // Only when the reply ends or a refused status is waiting.
  }, [streaming, unsynced]);

  const apply = () => {
    const current = useDiagram.getState().diagram;
    if (applied !== null && current === applied) return; // already in: never twice
    const r = applyProposal(current, proposal.ops, { catalog, newId: proposalNodeId });
    if (!r.ok) {
      setNote(r.code === 'missing' ? STALE : `Não dá para aplicar: ${r.message}`);
      return;
    }
    setBefore(current);
    useDiagram.getState().replaceDiagram(r.diagram);
    setApplied(r.diagram);
    setNote('Proposta aplicada. Ctrl+Z desfaz.');
    setStatus('applied');
  };

  const undo = () => {
    useDiagram.getState().undo();
  };

  // Follow undo and redo, by Desfazer or by Ctrl+Z / Ctrl+Shift+Z (FR-8): back to the
  // diagram before Aplicar → pending again; forward to the one it made → applied again.
  useEffect(() => {
    if (proposal.status === 'applied' && before !== null && diagram === before) {
      setNote('Proposta desfeita.');
      setStatus('pending');
    } else if (proposal.status === 'pending' && applied !== null && diagram === applied) {
      setNote('Proposta aplicada de novo.');
      setStatus('applied');
    }
    // Runs on the transition only: setStatus is a fresh closure every render.
  }, [diagram, before, applied, proposal.status]);

  const canUndo =
    proposal.status === 'applied' && applied !== null && diagram === applied && !streaming;

  return (
    <section className={`proposal proposal-${proposal.status}`} aria-label="Proposta do mentor">
      <header className="proposal-head">
        <span className="proposal-badge">{STATUS_LABEL[proposal.status]}</span>
        <span className="proposal-summary">{proposal.summary}</span>
      </header>
      <ul className="proposal-ops">
        {proposal.ops.map((op, i) => (
          <li key={`${String(i)}-${op.op}`}>{describeOp(op, diagram, proposal.ops, catalog)}</li>
        ))}
      </ul>
      <div className="proposal-actions">
        {proposal.status === 'pending' && (
          <>
            <button type="button" className="button primary" onClick={apply} disabled={streaming}>
              Aplicar
            </button>
            <button
              type="button"
              className="button"
              disabled={streaming}
              onClick={() => {
                setNote(null);
                setStatus('discarded');
              }}
            >
              Descartar
            </button>
          </>
        )}
        {canUndo && (
          <button type="button" className="button" onClick={undo}>
            Desfazer
          </button>
        )}
      </div>
      {note && (
        <p className="proposal-note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
