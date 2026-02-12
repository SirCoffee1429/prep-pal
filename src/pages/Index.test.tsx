import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Index from "./Index";

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("Index Page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders "Prep Master" title', () => {
    render(<MemoryRouter><Index /></MemoryRouter>);
    expect(screen.getByText("Prep Master")).toBeInTheDocument();
  });

  it("renders Admin and Staff buttons", () => {
    render(<MemoryRouter><Index /></MemoryRouter>);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
  });

  it("Admin button navigates to /admin", async () => {
    render(<MemoryRouter><Index /></MemoryRouter>);
    await userEvent.click(screen.getByText("Admin"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin");
  });
});
