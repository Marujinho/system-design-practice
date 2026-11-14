import { catalog } from '@archsim/catalog';
import type { Proposal, ProposalStatus } from '@archsim/problems';
import type { Diagram } from '@archsim/sim-engine';
import { useState } from 'react';
import { useDiagram } from '../store/diagram-store';
import { applyProposal, describeOp, proposalNodeId } from '../store/proposal';
import { ApiError } from './api';
import { mentorApi } from './mentor-api';

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
  const [applied, setApplied] = useState<Diagram | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const setStatus = (status: ProposalStatus) => {
    onChange({ ...proposal, status });
    mentorApi.proposalStatus(problemId, proposal.id, status).catch((e: unknown) => {
      setNote(
        e instanceof ApiError
          ? `Não consegui guardar o estado da proposta: ${e.message}`
          : 'Não consegui guardar o estado da proposta.',
      );
    });
  };

  const apply = () => {
    const r = applyProposal(useDiagram.getState().diagram, proposal.ops, {
      catalog,
      newId: proposalNodeId,
    });
    if (!r.ok) {
      setNote(r.code === 'missing' ? STALE : `Não dá para aplicar: ${r.message}`);
      return;
    }
    useDiagram.getState().replaceDiagram(r.diagram);
    setApplied(r.diagram);
    setNote('Proposta aplicada. Ctrl+Z desfaz.');
    setStatus('applied');
  };

  const undo = () => {
    useDiagram.getState().undo();
    setApplied(null);
    setNote('Proposta desfeita.');
    setStatus('pending');
  };

  const canUndo = proposal.status === 'applied' && applied !== null && diagram === applied;

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
            <button type="button" className="button primary" onClick={apply}>
              Aplicar
            </button>
            <button
              type="button"
              className="button"
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
