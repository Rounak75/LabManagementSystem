import { describe, it, expect, beforeEach } from "vitest";
import { useToast } from "../toast.store";

describe("toast.store", () => {
  beforeEach(() => useToast.setState({ items: [] }));

  it("adds an error toast and assigns a numeric id", () => {
    useToast.getState().error("Something failed");
    const items = useToast.getState().items;
    expect(items).toHaveLength(1);
    const first = items[0]!;
    expect(first.severity).toBe("error");
    expect(first.message).toBe("Something failed");
    expect(typeof first.id).toBe("number");
  });

  it("dismiss removes by id", () => {
    useToast.getState().info("hi");
    const id = useToast.getState().items[0]!.id;
    useToast.getState().dismiss(id);
    expect(useToast.getState().items).toHaveLength(0);
  });
});
