/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../assets/navbar/logo.svg", () => ({
  default: "logo.svg",
}));

import {
  BetaAccessGate,
  isBetaGateEnabled,
} from "../components/BetaAccessGate";

describe("BetaAccessGate", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BetaAccessGate isOpen={false} onClose={mockOnClose} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders the routing-upgrade maintenance screen when open", () => {
    render(<BetaAccessGate isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("MultiHopper")).toBeInTheDocument();
    expect(screen.getByText("Routing upgrade in process")).toBeInTheDocument();
    expect(screen.getByText("Services resuming shortly...")).toBeInTheDocument();
    expect(screen.getAllByTestId("routing-upgrade-dot")).toHaveLength(5);
  });

  it("calls onClose when the splash screen is clicked", () => {
    render(<BetaAccessGate isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId("routing-upgrade-backdrop"));

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when escape is pressed", () => {
    render(<BetaAccessGate isOpen={true} onClose={mockOnClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockOnClose).toHaveBeenCalledOnce();
  });
});

describe("isBetaGateEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when VITE_BETA_GATE_ENABLED is 'true'", () => {
    vi.stubEnv("VITE_BETA_GATE_ENABLED", "true");
    expect(isBetaGateEnabled()).toBe(true);
  });

  it("returns false when VITE_BETA_GATE_ENABLED is unset", () => {
    vi.stubEnv("VITE_BETA_GATE_ENABLED", "");
    expect(isBetaGateEnabled()).toBe(false);
  });

  it("returns false for any other value", () => {
    vi.stubEnv("VITE_BETA_GATE_ENABLED", "false");
    expect(isBetaGateEnabled()).toBe(false);
  });
});
