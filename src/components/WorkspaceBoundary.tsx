import {Component, type ReactNode} from "react";
import {InkButton} from "./InkControl";

export class WorkspaceBoundary extends Component<{children:ReactNode;name:string;active?:boolean},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.active === false) return null;
    return <section className="workspace-load-error" role="alert">
      <h2>{this.props.name} could not open</h2>
      <p>Reload LMBook to try again. Saved notes and notebooks remain on this computer.</p>
      <InkButton className="button" onClick={()=>window.location.reload()}>Reload LMBook</InkButton>
    </section>;
  }
}
