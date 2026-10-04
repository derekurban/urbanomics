import React from 'react';

// If a view fails to render, say so plainly and offer the way back instead of a blank window.
export class RenderRecovery extends React.Component {
  state = {error: null};
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error, info) {
    console.error('Urbanomics renderer failed:', error?.stack || String(error), info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <main role="alert" className="render-recovery">
      <h1>This view didn't load.</h1>
      <p>Your saved data is safe on this computer. Reload to continue; edits that weren't saved yet will be lost.</p>
      <button className="primary" onClick={()=>location.reload()}>Reload Urbanomics</button>
      <details><summary>Error details</summary><pre>{this.state.error?.message||String(this.state.error)}</pre></details>
    </main>;
  }
}
