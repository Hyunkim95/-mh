/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../components/Button";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Press</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("does not call onClick when disabled", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>Press</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("applies the disabled attribute", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("defaults to primary variant styles", () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-[220px]");
    expect(btn.className).toContain("bg-[var(--laser-lemon-500)]");
  });

  it("applies primarySm variant styles", () => {
    render(<Button variant="primarySm">Small</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-[141px]");
  });

  it("applies secondary variant styles with inset shadow", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-transparent");
    expect(btn.className).toContain("border-white");
    expect(btn.style.boxShadow).toContain("inset");
  });

  it("applies ghost variant styles", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-transparent");
    expect(btn.className).toContain("border-white/25");
  });

  it("applies icon variant styles", () => {
    render(<Button variant="icon">+</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("max-w-[46px]");
  });

  it("does not apply inset shadow for non-secondary variants", () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.style.boxShadow).toBe("");
  });

  it("passes through className prop", () => {
    render(<Button className="custom-class">Custom</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("custom-class");
  });

  it("passes through id prop", () => {
    render(<Button id="test-id">ID</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("id", "test-id");
  });

  it("passes through data-testid prop", () => {
    render(<Button data-testid="my-btn">Test</Button>);
    expect(screen.getByTestId("my-btn")).toBeInTheDocument();
  });
});
