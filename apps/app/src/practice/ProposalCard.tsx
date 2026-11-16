import { catalog } from '@archsim/catalog';
import type { Proposal, ProposalStatus } from '@archsim/problems';
import type { Diagram } from '@archsim/sim-engine';
import { useEffect, useState } from 'react';
import type { Key } from '../i18n/pt';
import { useLang } from '../i18n/store';
import { tr, useT } from '../i18n/t';
import { useDiagram } from '../store/diagram-store';
import { applyProposal, describeOp, proposalNodeId } from '../store/proposal';
import { ApiError } from './api';
import { mentorApi, useMentorUi } from './mentor-api';

const STATUS_KEY: Record<ProposalStatus, Key> = {
  pending: 'proposal.pending',
  applied: 'proposal.applied',
  discarded: 'proposal.discarded',
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
  const t = useT();
  const lang = useLang();
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
            ? tr('proposal.saveFailedWhy', { error: e.message })
            : tr('proposal.saveFailed'),
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
      setNote(
        r.code === 'missing'
          ? tr('proposal.stale')
          : tr('proposal.cannotApply', { reason: r.message }),
      );
      return;
    }
    setBefore(current);
    useDiagram.getState().replaceDiagram(r.diagram);
    setApplied(r.diagram);
    setNote(tr('proposal.appliedNote'));
    setStatus('applied');
  };

  const undo = () => {
    useDiagram.getState().undo();
  };

  // Follow undo and redo, by Desfazer or by Ctrl+Z / Ctrl+Shift+Z (FR-8): back to the
  // diagram before Aplicar → pending again; forward to the one it made → applied again.
  useEffect(() => {
    if (proposal.status === 'applied' && before !== null && diagram === before) {
      setNote(tr('proposal.undone'));
      setStatus('pending');
    } else if (proposal.status === 'pending' && applied !== null && diagram === applied) {
      setNote(tr('proposal.reapplied'));
      setStatus('applied');
    }
    // Runs on the transition only: setStatus is a fresh closure every render.
  }, [diagram, before, applied, proposal.status]);

  const canUndo =
    proposal.status === 'applied' && applied !== null && diagram === applied && !streaming;

  return (
    <section className={`proposal proposal-${proposal.status}`} aria-label={t('proposal.label')}>
      <header className="proposal-head">
        <span className="proposal-badge">{t(STATUS_KEY[proposal.status])}</span>
        <span className="proposal-summary">{proposal.summary}</span>
      </header>
      <ul className="proposal-ops">
        {proposal.ops.map((op, i) => (
          <li key={`${String(i)}-${op.op}`}>
            {describeOp(op, diagram, proposal.ops, catalog, lang)}
          </li>
        ))}
      </ul>
      <div className="proposal-actions">
        {proposal.status === 'pending' && (
          <>
            <button type="button" className="button primary" onClick={apply} disabled={streaming}>
              {t('proposal.apply')}
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
              {t('proposal.discard')}
            </button>
          </>
        )}
        {canUndo && (
          <button type="button" className="button" onClick={undo}>
            {t('proposal.undo')}
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
