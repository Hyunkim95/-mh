/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Search } from "../components/Search";

interface TestItem {
  name: string;
  symbol: string;
}

describe("Search", () => {
  it("renders an input with the placeholder", () => {
    render(<Search<TestItem> query="" onQueryChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search tokens")).toBeInTheDocument();
  });

  it("uses custom placeholder", () => {
    render(<Search<TestItem> query="" onQueryChange={vi.fn()} placeholder="Find items" />);
    expect(screen.getByPlaceholderText("Find items")).toBeInTheDocument();
  });

  it("displays the current query value", () => {
    render(<Search<TestItem> query="hello" onQueryChange={vi.fn()} />);
    expect(screen.getByDisplayValue("hello")).toBeInTheDocument();
  });

  it("calls onQueryChange when input changes", () => {
    const handleChange = vi.fn();
    render(<Search<TestItem> query="" onQueryChange={handleChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SOL" } });
    expect(handleChange).toHaveBeenCalledWith("SOL");
  });

  it("renders criteria chips when provided", () => {
    const criteria = [
      { key: "name" as const, label: "Name" },
      { key: "symbol" as const, label: "Symbol" },
    ];
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={criteria}
        activeCriteria={[]}
      />
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
  });

  it("highlights active criteria chips", () => {
    const criteria = [
      { key: "name" as const, label: "Name" },
      { key: "symbol" as const, label: "Symbol" },
    ];
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={criteria}
        activeCriteria={["name"]}
      />
    );
    const nameChip = screen.getByText("Name");
    expect(nameChip.className).toContain("bg-white/15");

    const symbolChip = screen.getByText("Symbol");
    expect(symbolChip.className).toContain("bg-white/5");
  });

  it("toggles criteria on chip click", () => {
    const handleCriteriaChange = vi.fn();
    const criteria = [
      { key: "name" as const, label: "Name" },
      { key: "symbol" as const, label: "Symbol" },
    ];
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={criteria}
        activeCriteria={["name"]}
        onCriteriaChange={handleCriteriaChange}
      />
    );

    // Click Symbol to add it
    fireEvent.click(screen.getByText("Symbol"));
    expect(handleCriteriaChange).toHaveBeenCalledWith(["name", "symbol"]);
  });

  it("removes criteria when active chip is clicked", () => {
    const handleCriteriaChange = vi.fn();
    const criteria = [
      { key: "name" as const, label: "Name" },
    ];
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={criteria}
        activeCriteria={["name"]}
        onCriteriaChange={handleCriteriaChange}
      />
    );

    fireEvent.click(screen.getByText("Name"));
    expect(handleCriteriaChange).toHaveBeenCalledWith([]);
  });

  it("does not render chips when showCriteriaChips is false", () => {
    const criteria = [
      { key: "name" as const, label: "Name" },
    ];
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={criteria}
        showCriteriaChips={false}
      />
    );
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("does not render chips when criteria is empty", () => {
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={[]}
      />
    );
    // Only the input container should exist
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(0);
  });

  it("ignores chip click when no onCriteriaChange handler", () => {
    const criteria = [
      { key: "name" as const, label: "Name" },
    ];
    render(
      <Search<TestItem>
        query=""
        onQueryChange={vi.fn()}
        criteria={criteria}
        activeCriteria={[]}
      />
    );
    // Should not throw
    fireEvent.click(screen.getByText("Name"));
  });
});
