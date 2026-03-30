/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { SkeletonCard } from "../components/SkeletonCard";

describe("SkeletonCard", () => {
  it("renders without crashing", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("has the animate-pulse class for loading animation", () => {
    const { container } = render(<SkeletonCard />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("animate-pulse");
  });

  it("has rounded styling", () => {
    const { container } = render(<SkeletonCard />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("rounded-3xl");
  });

  it("has a fixed height", () => {
    const { container } = render(<SkeletonCard />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("h-[82px]");
  });
});
