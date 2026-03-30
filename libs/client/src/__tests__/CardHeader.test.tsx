/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardHeader } from "../components/CardHeader";

describe("CardHeader", () => {
  const createTab = (key: string, label: string) => ({
    key,
    label,
    onTabClick: vi.fn(),
    icon: `${key}-icon.png`,
  });

  it("renders tab labels", () => {
    const tabs = [createTab("routes", "Routes"), createTab("hops", "Hops")];
    render(<CardHeader tabs={tabs} activeKey="routes" />);
    expect(screen.getByText("Routes")).toBeInTheDocument();
    expect(screen.getByText("Hops")).toBeInTheDocument();
  });

  it("calls onTabClick when a tab is clicked", () => {
    const tabs = [createTab("routes", "Routes"), createTab("hops", "Hops")];
    render(<CardHeader tabs={tabs} activeKey="routes" />);
    fireEvent.click(screen.getByRole("tab", { name: /Hops/ }));
    expect(tabs[1].onTabClick).toHaveBeenCalledWith("hops");
  });

  it("marks active tab with aria-selected=true", () => {
    const tabs = [createTab("routes", "Routes"), createTab("hops", "Hops")];
    render(<CardHeader tabs={tabs} activeKey="routes" />);
    expect(screen.getByRole("tab", { name: /Routes/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Hops/ })).toHaveAttribute("aria-selected", "false");
  });

  it("renders icon as img when icon is a string", () => {
    const tabs = [createTab("routes", "Routes")];
    render(<CardHeader tabs={tabs} activeKey="routes" />);
    const img = screen.getByAltText("routes-icon");
    expect(img).toHaveAttribute("src", "routes-icon.png");
  });

  it("renders icon as React element when provided", () => {
    const tabs = [{
      key: "test",
      label: "Test",
      onTabClick: vi.fn(),
      icon: <span data-testid="custom-icon">icon</span>,
    }];
    render(<CardHeader tabs={tabs} activeKey="test" />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("renders icon as component when provided as ElementType", () => {
    const IconComponent = () => <span data-testid="component-icon">icon</span>;
    const tabs = [{
      key: "test",
      label: "Test",
      onTabClick: vi.fn(),
      icon: IconComponent,
    }];
    render(<CardHeader tabs={tabs} activeKey="test" />);
    expect(screen.getByTestId("component-icon")).toBeInTheDocument();
  });

  it("renders leftSlot content", () => {
    const tabs = [createTab("routes", "Routes")];
    render(
      <CardHeader
        tabs={tabs}
        activeKey="routes"
        leftSlot={<span data-testid="left">Left</span>}
      />
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
  });

  it("renders rightSlot content", () => {
    const tabs = [createTab("routes", "Routes")];
    render(
      <CardHeader
        tabs={tabs}
        activeKey="routes"
        rightSlot={<span data-testid="right">Right</span>}
      />
    );
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  it("does not render leftSlot when not provided", () => {
    const tabs = [createTab("routes", "Routes")];
    const { container } = render(<CardHeader tabs={tabs} activeKey="routes" />);
    expect(container.querySelectorAll("[data-testid='left']")).toHaveLength(0);
  });

  it("renders tab without label", () => {
    const tabs = [{
      key: "icon-only",
      onTabClick: vi.fn(),
      icon: "icon.png",
    }];
    render(<CardHeader tabs={tabs} activeKey="icon-only" />);
    // Should render without crashing, tab exists
    expect(screen.getByRole("tab")).toBeInTheDocument();
  });
});
