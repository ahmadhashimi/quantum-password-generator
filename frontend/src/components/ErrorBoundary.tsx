import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-semibold">Something went wrong.</p>
        <a href="#/" onClick={() => this.setState({ failed: false })} className="btn-primary mt-4">Back to start</a>
      </div>
    );
  }
}
