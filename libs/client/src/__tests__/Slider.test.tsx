/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Slider } from "../components/Slider";

describe("Slider", () => {
  it("renders a range input", () => {
    render(<Slider value={50} min={0} max={100} onChange={vi.fn()} />);
    const input = screen.getByRole("slider");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "range");
  });

  it("sets min, max, and value attributes", () => {
    render(<Slider value={30} min={10} max={90} onChange={vi.fn()} />);
    const input = screen.getByRole("slider");
    expect(input).toHaveAttribute("min", "10");
    expect(input).toHaveAttribute("max", "90");
    expect(input).toHaveAttribute("value", "30");
  });

  it("sets aria attributes", () => {
    render(<Slider value={50} min={0} max={100} onChange={vi.fn()} />);
    const input = screen.getByRole("slider");
    expect(input).toHaveAttribute("aria-valuemin", "0");
    expect(input).toHaveAttribute("aria-valuemax", "100");
    expect(input).toHaveAttribute("aria-valuenow", "50");
  });

  it("calls onChange with numeric value", () => {
    const handleChange = vi.fn();
    render(<Slider value={50} min={0} max={100} onChange={handleChange} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "75" } });
    expect(handleChange).toHaveBeenCalledWith(75);
  });

  it("defaults step to 1", () => {
    render(<Slider value={50} min={0} max={100} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("step", "1");
  });

  it("accepts custom step", () => {
    render(<Slider value={50} min={0} max={100} step={5} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("step", "5");
  });

  it("clamps value to min when value < min", () => {
    render(<Slider value={-10} min={0} max={100} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("value", "0");
  });

  it("clamps value to max when value > max", () => {
    render(<Slider value={200} min={0} max={100} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("value", "100");
  });

  it("calculates fill percentage as CSS variable", () => {
    render(<Slider value={50} min={0} max={100} onChange={vi.fn()} />);
    const input = screen.getByRole("slider");
    expect(input.style.getPropertyValue("--fill")).toBe("50%");
  });

  it("handles 0% fill when max <= min", () => {
    render(<Slider value={50} min={100} max={100} onChange={vi.fn()} />);
    const input = screen.getByRole("slider");
    expect(input.style.getPropertyValue("--fill")).toBe("0%");
  });

  it("applies optional className", () => {
    render(<Slider value={50} min={0} max={100} onChange={vi.fn()} className="extra" />);
    expect(screen.getByRole("slider").className).toContain("extra");
  });
});
