import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          data: [],
          error: null,
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        data: [],
        error: null,
      }),
    }),
  },
}));

// Mock child components to avoid deep dependency issues
vi.mock("@/components/admin/ParManagement", () => ({ default: () => <div data-testid="par-management">Par Management</div> }));
vi.mock("@/components/admin/RecipeManagement", () => ({ default: () => <div data-testid="recipe-management">Recipe Management</div> }));
vi.mock("@/components/admin/SalesUpload", () => ({ default: () => <div data-testid="sales-upload">Sales Upload</div> }));
vi.mock("@/components/admin/MenuItemManagement", () => ({ default: () => <div data-testid="menu-item-management">Menu Item Management</div> }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("AdminDashboard", () => {
  it("renders without requiring login (auth bypassed)", () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });

  it("shows all 4 tab triggers", () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(screen.getByText("Par Levels")).toBeInTheDocument();
    expect(screen.getByText("Recipes")).toBeInTheDocument();
    expect(screen.getByText("Sales Data")).toBeInTheDocument();
    expect(screen.getByText("Menu Items")).toBeInTheDocument();
  });

  it("defaults to Par Levels tab content", () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(screen.getByTestId("par-management")).toBeInTheDocument();
  });

  it('shows header with "Prep Master" and "Admin Dashboard"', () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(screen.getByText("Prep Master")).toBeInTheDocument();
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });
});
