import React, { useEffect, useRef, useState } from "react";

/** One maintenance action: what it does, what it would touch now, and a button that opens its confirmation. */
export function AdminAction({ title, children, count, action, onOpen, disabled }) {
  return (
    <article className="admin-action">
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        <small>{count}</small>
      </div>
      <button className="danger sm" disabled={disabled} onClick={onOpen}>{action}</button>
    </article>
  );
}

/** Preview, confirm, run: shared by every maintenance action. */
export function useAdminAction({ data, act, busy, preview: load, run }) {
  const [preview, setPreview] = useState(null), [confirmation, setConfirmation] = useState(null), [working, setWorking] = useState(false), [error, setError] = useState(""), [result, setResult] = useState(null);
  const saving = useRef(false);
  useEffect(() => {
    let live = true;
    load().then((v) => { if (live) setPreview(v); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data]);
  async function open() {
    setWorking(true); setError(""); setResult(null);
    try { const v = await load(); setPreview(v); setConfirmation(v); } catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  const close = () => { if (!saving.current) { setConfirmation(null); setError(""); } };
  async function confirm(...args) {
    if (saving.current || busy) return;
    saving.current = true; setWorking(true); setError("");
    try {
      const value = await act(async () => { try { return await run(confirmation, ...args); } catch (e) { setError(e.message); throw e; } });
      if (value !== false) { setResult(value); setConfirmation(null); setPreview(await load()); }
    } catch (e) { setError(e.message); } finally { saving.current = false; setWorking(false); }
  }
  return { preview, confirmation, working, error, result, open, close, confirm, setResult };
}
