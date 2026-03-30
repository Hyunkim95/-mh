/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BetaAccessGate, isBetaUnlocked } from "../components/BetaAccessGate";

// Create a proper localStorage mock for Node 25 compatibility
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

describe("BetaAccessGate", () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BetaAccessGate isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the modal when isOpen is true", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    expect(screen.getByText("Private Beta Testing")).toBeInTheDocument();
    expect(screen.getByText("Beta Access")).toBeInTheDocument();
  });

  it("renders password input and submit button", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    expect(screen.getByPlaceholderText("Enter your access code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter Beta" })).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    const backdrop = document.querySelector(".bg-black\\/80") as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("calls onSuccess with correct password", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    const input = screen.getByPlaceholderText("Enter your access code");
    fireEvent.change(input, { target: { value: "enigma2025" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Beta" }));
    expect(mockOnSuccess).toHaveBeenCalledOnce();
    expect(localStorageMock.setItem).toHaveBeenCalledWith("multihopper_beta_access", "true");
  });

  it("shows error for wrong password", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    const input = screen.getByPlaceholderText("Enter your access code");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Beta" }));
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("Invalid access code. Please try again.")).toBeInTheDocument();
  });

  it("clears password field on wrong attempt", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    const input = screen.getByPlaceholderText("Enter your access code") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Beta" }));
    expect(input.value).toBe("");
  });

  it("clears error when typing after failed attempt", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    const input = screen.getByPlaceholderText("Enter your access code");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Beta" }));
    expect(screen.getByText("Invalid access code. Please try again.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.queryByText("Invalid access code. Please try again.")).not.toBeInTheDocument();
  });

  it("renders social links", () => {
    render(
      <BetaAccessGate isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
    );
    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByText("X / Twitter")).toBeInTheDocument();
  });
});

describe("isBetaUnlocked", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("returns false when not set", () => {
    expect(isBetaUnlocked()).toBe(false);
  });

  it("returns true when localStorage has the key", () => {
    localStorageMock.setItem("multihopper_beta_access", "true");
    expect(isBetaUnlocked()).toBe(true);
  });

  it("returns false for invalid value", () => {
    localStorageMock.setItem("multihopper_beta_access", "false");
    expect(isBetaUnlocked()).toBe(false);
  });
});
