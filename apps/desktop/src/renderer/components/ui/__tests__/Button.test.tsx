import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

describe("Button", () => {
  it("renders label and fires onClick", async () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("applies danger variant class", () => {
    render(<Button variant="danger">Del</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-danger");
  });
});
