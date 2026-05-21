import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UpdateBanner } from "../UpdateBanner";

let downloadedCb: ((info: { version: string }) => void) | null = null;
const invoke = vi.fn().mockResolvedValue({ ok: true });
beforeEach(() => {
  downloadedCb = null;
  invoke.mockClear();
  (window as any).api = {
    invoke,
    onUpdateDownloaded: (cb: (info: { version: string }) => void) => { downloadedCb = cb; return () => {}; },
  };
});

describe("UpdateBanner", () => {
  it("renders nothing until an update is downloaded", () => {
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a restart notice after update-downloaded fires", () => {
    render(<UpdateBanner />);
    act(() => downloadedCb!({ version: "1.2.3" }));
    expect(screen.getByText(/new version/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restart/i })).toBeInTheDocument();
  });

  it("invokes updater:quitAndInstall when Restart is clicked", () => {
    render(<UpdateBanner />);
    act(() => downloadedCb!({ version: "1.2.3" }));
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(invoke).toHaveBeenCalledWith("updater:quitAndInstall");
  });
});
