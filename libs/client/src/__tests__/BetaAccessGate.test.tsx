/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../assets/navbar/logo.svg", () => ({
  default: "logo.svg",
}));

import {
  BetaAccessGate,
  BETA_ACCESS_STORAGE_KEY,
  isBetaUnlocked,
} from "../components/BetaAccessGate";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("BetaAccessGate", () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BetaAccessGate
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders the routing-upgrade maintenance screen when open", () => {
    render(
      <BetaAccessGate
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText("MultiHopper")).toBeInTheDocument();
    expect(screen.getByText("Routing upgrade in process")).toBeInTheDocument();
    expect(screen.getByText("Services resuming shortly...")).toBeInTheDocument();
    expect(screen.getAllByTestId("routing-upgrade-dot")).toHaveLength(5);
  });

  it("calls onClose when the backdrop is clicked", () => {
    render(
      <BetaAccessGate
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.click(screen.getByTestId("routing-upgrade-backdrop"));

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when escape is pressed", () => {
    render(
      <BetaAccessGate
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("does not call onSuccess from the maintenance screen", () => {
    render(
      <BetaAccessGate
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});

describe("isBetaUnlocked", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("returns false when not set", () => {
    expect(isBetaUnlocked()).toBe(false);
  });

  it("returns true when the bypass key is set", () => {
    localStorageMock.setItem(BETA_ACCESS_STORAGE_KEY, "true");
    expect(isBetaUnlocked()).toBe(true);
  });

  it("returns false for any other value", () => {
    localStorageMock.setItem(BETA_ACCESS_STORAGE_KEY, "false");
    expect(isBetaUnlocked()).toBe(false);
  });
});
