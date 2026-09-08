import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Catches any render error in the app and shows a calm fallback instead of a
 * blank white screen. React needs a class component for this.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GlucoCare error boundary caught:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#071512] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold">Something went wrong</h1>
          <p className="text-slate-400 mt-4">
            The page ran into an unexpected error. Your saved assessment has not
            been deleted.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }
}
