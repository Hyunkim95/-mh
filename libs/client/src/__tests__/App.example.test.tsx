/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/AppRouter", () => ({
  AppRouter: () => <div data-testid="app-router">router mounted</div>,
}));

import App from "../App.example";

describe("App.example", () => {
  it("renders the app router", () => {
    render(<App />);

    expect(screen.getByTestId("app-router")).toHaveTextContent(
      "router mounted"
    );
  });
});
