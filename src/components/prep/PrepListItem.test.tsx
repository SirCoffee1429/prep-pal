import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PrepListItem from "./PrepListItem";

// Mock supabase types - provide the enum type inline
vi.mock("@/integrations/supabase/types", () => ({
  Constants: {
    public: {
      Enums: {
        prep_status: ["open", "in_progress", "completed"],
      },
    },
  },
}));

const defaultProps = {
  id: "item-1",
  name: "Peanut Dressing",
  quantity: 5,
  unit: "qt",
  status: "open" as const,
  onStatusChange: vi.fn(),
  onViewRecipe: vi.fn(),
};

describe("PrepListItem", () => {
  beforeEach(() => {
    defaultProps.onStatusChange.mockClear();
    defaultProps.onViewRecipe.mockClear();
  });

  it("renders item name, quantity, and unit", () => {
    render(<PrepListItem {...defaultProps} />);
    expect(screen.getByText("Peanut Dressing")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("qt")).toBeInTheDocument();
  });

  it("shows correct aria label for open status", () => {
    render(<PrepListItem {...defaultProps} status="open" />);
    expect(screen.getByLabelText("Change status from Open")).toBeInTheDocument();
  });

  it("shows correct aria label for in_progress status", () => {
    render(<PrepListItem {...defaultProps} status="in_progress" />);
    expect(screen.getByLabelText("Change status from In Progress")).toBeInTheDocument();
  });

  it("cycles status on button click: open -> in_progress", async () => {
    render(<PrepListItem {...defaultProps} status="open" />);
    await userEvent.click(screen.getByLabelText("Change status from Open"));
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith("in_progress");
  });

  it("cycles status: in_progress -> completed", async () => {
    render(<PrepListItem {...defaultProps} status="in_progress" />);
    await userEvent.click(screen.getByLabelText("Change status from In Progress"));
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith("completed");
  });

  it("cycles status: completed -> open", async () => {
    render(<PrepListItem {...defaultProps} status="completed" />);
    await userEvent.click(screen.getByLabelText("Change status from Done"));
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith("open");
  });

  it("applies line-through styling when completed", () => {
    render(<PrepListItem {...defaultProps} status="completed" />);
    const name = screen.getByText("Peanut Dressing");
    expect(name.className).toContain("line-through");
  });
});
