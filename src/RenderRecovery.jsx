import React from 'react';

export class RenderRecovery extends React.Component {
  state = {error: null};
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error, info) {
    console.error('Urbanomics renderer failed:', error?.stack || String(error), info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <main role="alert" style={{maxWidth:620,margin:'12vh auto',padding:32,fontFamily:'system-ui',color:'#333',background:'#fafafa',border:'1px solid #ddd',borderRadius:16}}>
      <h1 style={{fontSize:24}}>This view ran into a problem</h1>
      <p>Your saved data is still on this computer. Reloading will discard any unsaved edits.</p>
      <button onClick={()=>location.reload()}>Reload Urbanomics</button>
      <details style={{marginTop:24}}><summary>Error details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{this.state.error?.message||String(this.state.error)}</pre></details>
    </main>;
  }
}
