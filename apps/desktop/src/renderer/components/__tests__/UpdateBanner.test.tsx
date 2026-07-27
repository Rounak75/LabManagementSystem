import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UpdateBanner } from "../UpdateBanner";

let availableCb: ((info: { version: string }) => void) | null = null;
let downloadedCb: ((info: { version: string }) => void) | null = null;
const invoke = vi.fn().mockResolvedValue({ ok: true });
beforeEach(() => {
  availableCb = null;
  downloadedCb = null;
  invoke.mockClear();
  (window as any).api = {
    invoke,
    onUpdateAvailable: (cb: (info: { version: string }) => void) => { availableCb = cb; return () => {}; },
    onUpdateDownloaded: (cb: (info: { version: string }) => void) => { downloadedCb = cb; return () => {}; },
  };
});

describe("UpdateBanner", () => {
  it("renders nothing until there is an update", () => {
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  // Downloading is the moment unsigned code would reach the lab PC. It has to be
  // a decision the operator makes, so the banner offers it rather than reporting it.
  it("offers a download when an update becomes available", () => {
    render(<UpdateBanner />);
    act(() => availableCb!({ version: "1.2.3" }));
    expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restart/i })).not.toBeInTheDocument();
  });

  it("invokes updater:download when Download is clicked", () => {
    render(<UpdateBanner />);
    act(() => availableCb!({ version: "1.2.3" }));
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(invoke).toHaveBeenCalledWith("updater:download");
  });

  it("reports progress and stops offering a second download once clicked", () => {
    render(<UpdateBanner />);
    act(() => availableCb!({ version: "1.2.3" }));
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(screen.getByText(/downloading/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });

  it("shows a restart notice after update-downloaded fires", () => {
    render(<UpdateBanner />);
    act(() => downloadedCb!({ version: "1.2.3" }));
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restart/i })).toBeInTheDocument();
  });

  it("invokes updater:quitAndInstall when Restart is clicked", () => {
    render(<UpdateBanner />);
    act(() => downloadedCb!({ version: "1.2.3" }));
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(invoke).toHaveBeenCalledWith("updater:quitAndInstall");
  });
});
