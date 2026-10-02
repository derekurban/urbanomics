// Settings → About: which Urbanomics this is and whether a newer release is waiting.
// Installed releases check on their own; this page lets you check now or restart into
// a downloaded update. Development runs and the browser say so instead.
import React, { useEffect, useState } from "react";
const api = window.urbanomics;
const when = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : "");

export function AboutWorkspace() {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api.updatesState().then((s) => { if (live) setState(s); }).catch((e) => setError(e.message));
    const off = api.onUpdate?.((s) => { if (live) setState(s); });
    return () => { live = false; off?.(); };
  }, []);
  async function act(fn) {
    setBusy(true); setError("");
    try { const next = await fn(); if (next && typeof next === "object") setState(next); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const build = state?.build === "release" ? "Installed release" : state?.build === "development" ? "Development build" : "Browser";
  let status = "", primary = null;
  if (state?.supported) {
    if (state.status === "ready") { status = `Version ${state.latest} is downloaded. It installs when you restart.`; primary = <button className="primary" disabled={busy} onClick={() => act(() => api.installUpdate())}>Restart to update</button>; }
    else {
      status = state.status === "checking" ? "Checking for updates…"
        : state.status === "downloading" ? `Downloading ${state.latest || "the update"}… ${state.percent}%`
        : state.status === "current" ? `You're up to date${state.checkedAt ? ` · checked at ${when(state.checkedAt)}` : ""}.`
        : state.status === "error" ? state.error
        : "Updates are checked when the app starts and every six hours.";
      primary = <button className="primary" disabled={busy || state.status === "checking" || state.status === "downloading"} onClick={() => act(() => api.checkForUpdates())}>Check for updates</button>;
    }
  } else if (state?.build === "development") status = "This copy runs from the repository. It changes with Git; installed releases update themselves.";
  else if (state) status = "Updates are managed by the desktop app.";
  return (
    <section className="about-workspace">
      <h2>About</h2>
      <p className="about-version"><b>Urbanomics {state?.version || ""}</b><span>{state ? build : ""}</span></p>
      <p className={state?.status === "error" ? "about-status is-error" : "about-status"} role="status">{status}</p>
      {primary}
      {error && <p role="alert" className="dr-error-text">{error}</p>}
      <p className="about-note">Your workspace stays where it is through every update. Releases are published from the Urbanomics repository.</p>
    </section>
  );
}
