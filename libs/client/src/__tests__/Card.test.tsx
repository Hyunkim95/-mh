/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../components/Card";

describe("Card", () => {
  it("renders cardBody content", () => {
    render(<Card cardBody={<div>Body Content</div>} />);
    expect(screen.getByText("Body Content")).toBeInTheDocument();
  });

  it("renders cardFooter when provided", () => {
    render(
      <Card
        cardBody={<div>Body</div>}
        cardFooter={<div>Footer Content</div>}
      />
    );
    expect(screen.getByText("Footer Content")).toBeInTheDocument();
  });

  it("does not render footer when not provided", () => {
    render(<Card cardBody={<div>Body</div>} />);
    expect(screen.queryByText("Footer Content")).not.toBeInTheDocument();
  });

  it("applies custom cardHeight as inline style", () => {
    const { container } = render(
      <Card cardBody={<div>Body</div>} cardHeight="500px" />
    );
    const card = container.querySelector(".max-w-\\[709px\\]") as HTMLElement;
    expect(card.style.height).toBe("500px");
  });

  it("does not apply height style when cardHeight is auto", () => {
    const { container } = render(
      <Card cardBody={<div>Body</div>} cardHeight="auto" />
    );
    const card = container.querySelector(".max-w-\\[709px\\]") as HTMLElement;
    expect(card.style.height).toBe("");
  });

  it("applies custom cardStyle", () => {
    const { container } = render(
      <Card
        cardBody={<div>Body</div>}
        cardStyle={{ opacity: 0.5 }}
      />
    );
    const card = container.querySelector(".max-w-\\[709px\\]") as HTMLElement;
    expect(card.style.opacity).toBe("0.5");
  });

  it("applies cardClasses to main container", () => {
    const { container } = render(
      <Card
        cardBody={<div>Body</div>}
        cardClasses={{ mainCardContainer: "custom-card" }}
      />
    );
    const card = container.querySelector(".max-w-\\[709px\\]") as HTMLElement;
    expect(card.className).toContain("custom-card");
  });

  it("applies cardClasses to body container", () => {
    const { container } = render(
      <Card
        cardBody={<div>Body</div>}
        cardClasses={{ cardBodyContainer: "custom-body" }}
      />
    );
    const body = container.querySelector(".custom-body");
    expect(body).toBeInTheDocument();
  });

  it("renders CardHeader when cardHeader config is provided", () => {
    render(
      <Card
        cardBody={<div>Body</div>}
        cardHeader={{
          tabs: [{
            key: "tab1",
            label: "Tab 1",
            onTabClick: () => {},
            icon: "icon.png",
          }],
          activeKey: "tab1",
        }}
      />
    );
    expect(screen.getByText("Tab 1")).toBeInTheDocument();
  });

  it("does not render CardHeader when not provided", () => {
    const { container } = render(<Card cardBody={<div>Body</div>} />);
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });
});
