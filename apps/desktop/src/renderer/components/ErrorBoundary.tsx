import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    try {
      window.api.invoke("app:logError", {
        scope: "ErrorBoundary",
        message: error.message,
        stack: `${error.stack ?? ""}\n${info.componentStack}`,
      });
    } catch {
      /* logging must never crash the fallback */
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-800">Something went wrong</h1>
        <p className="max-w-md text-slate-500">
          The app hit an unexpected problem and stopped this screen. Your data is safe.
          Click Reload to continue. If it keeps happening, restart the app.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-slate-800 px-4 py-2 text-white hover:bg-slate-700"
        >
          Reload
        </button>
      </div>
    );
  }
}
