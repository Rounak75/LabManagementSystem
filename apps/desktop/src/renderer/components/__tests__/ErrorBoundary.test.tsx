import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

const invoke = vi.fn().mockResolvedValue({ ok: true, data: { ok: true } });
beforeEach(() => {
  invoke.mockClear();
  (window as any).api = { invoke };
});

function Boom(): JSX.Element { throw new Error("render crash"); }

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(<ErrorBoundary><div>safe content</div></ErrorBoundary>);
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("shows a friendly fallback and a Reload button when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("reports the crash to the main process via app:logError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(invoke).toHaveBeenCalledWith("app:logError", expect.objectContaining({ scope: "ErrorBoundary" }));
    spy.mockRestore();
  });
});
