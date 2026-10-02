import React, {useEffect, useRef, useState} from 'react';
import {WorkspaceModal} from './WorkspaceModal.jsx';
const api = window.urbanomics;
/* Clears every agreed split, repayment and deduction so the sharing model can be rebuilt from scratch. */
export function AdminClearShares({data, act, busy}) {
  const [preview, setPreview] = useState(null), [confirmation, setConfirmation] = useState(null), [working, setWorking] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  const saving = useRef(false);
  useEffect(() => { let live = true; api.previewClearShares().then(value => { if (live) setPreview(value); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [data]);
  const close = () => { if (!saving.current) { setConfirmation(null); setError(''); } };
  async function open() { setWorking(true); setError(''); try { const value = await api.previewClearShares(); setPreview(value); setConfirmation(value); } catch (e) { setError(e.message); } finally { setWorking(false); } }
  async function confirm() {
    if (saving.current || busy) return;
    saving.current = true; setWorking(true); setError('');
    try {
      const value = await act(async () => { try { return await api.clearAllShares(confirmation.token); } catch (e) { setError(e.message); throw e; } });
      if (value !== false) { setResult(value); setConfirmation(null); setPreview(await api.previewClearShares()); }
    } catch (e) { setError(e.message); } finally { saving.current = false; setWorking(false); }
  }
  const summary = p => `${p.shared} split ${p.shared === 1 ? 'expense' : 'expenses'} · ${p.repayments} ${p.repayments === 1 ? 'repayment' : 'repayments'}${p.cash ? ` (${p.cash} cash)` : ''}`;
  return <>
    <article className="admin-action"><div><span className="admin-action-label">Sharing</span><h3>Clear all splits and repayments</h3><p>Remove every agreed split, repayment and deduction across all accounts, so you can rebuild sharing from events and people.</p><small>{preview ? `${summary(preview)} · ${preview.count} transactions` : 'Checking splits…'}</small></div><button className="danger" disabled={busy || working || !preview?.count} onClick={open}>Clear all splits and repayments</button></article>
    {error && !confirmation && <p role="alert" className="dr-error-text">{error}</p>}
    {result && <div className="admin-result" role="status"><strong>{result.shared} splits and {result.repayments} repayments cleared · {result.count} transactions updated.</strong><p>A recovery copy was saved in your local workspace’s backups/admin folder. Events keep their participants; expenses pick the event split up again when they join or when participants change.</p></div>}
    {confirmation && <WorkspaceModal title="Clear all splits and repayments?" onClose={close} footer={<div className="admin-confirm-buttons"><button disabled={working} onClick={close}>Cancel</button><button className="danger" disabled={working || busy || !confirmation.count} onClick={confirm}>{working ? 'Clearing…' : 'Confirm clear all'}</button></div>}>
      <div className="admin-confirm"><p>Clear <strong>{summary(confirmation)}</strong> across <strong>{confirmation.count} transactions</strong>?</p><p>This covers every imported month and includes {confirmation.archived} transactions in archived accounts. Repayment receipts return to income when they carry income tags, otherwise to unsorted; their unsorted amounts reappear in Organize.</p><p>Amounts, source files, snapshots, tags, events, event participants, people, transfers and rules are kept. Dashboard net costs and “friends still owed” change until splits are declared again.</p><p>A local recovery copy is saved first. This action has no automatic undo.</p>{error && <p role="alert" className="dr-error-text">{error}</p>}</div>
    </WorkspaceModal>}
  </>;
}
