import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackupStatusCard } from "../BackupStatusCard";

const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  (window as any).api = { invoke };
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BackupStatusCard />
    </QueryClientProvider>,
  );
}

describe("BackupStatusCard", () => {
  /**
   * Silence is the healthy state.
   *
   * A card that is always on the dashboard is a card nobody reads by the second
   * week, and this one has to still be legible on the day it turns red. So it
   * renders nothing at all while backups are fine — the positive confirmation
   * lives in Settings → Backup, where someone goes to check on purpose.
   */
  it("renders nothing when backups are healthy", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { tone: "ok", headline: "Backups healthy", detail: null },
    });

    const { container } = renderCard();

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("backup:getHealth", undefined));
    expect(container).toBeEmptyDOMElement();
  });

  // The whole point of the change: this state used to be visible only in the
  // Settings history table, several clicks from anywhere anyone looks.
  it("shows the headline and detail when the off-machine copy is missing", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: {
        tone: "alarm",
        headline: "No off-machine backup",
        detail: "The copy that survives this PC's disk failing has never been written.",
      },
    });

    const { findByRole } = renderCard();

    const alert = await findByRole("alert");
    expect(alert).toHaveTextContent("No off-machine backup");
    expect(alert).toHaveTextContent("has never been written");
  });
});
