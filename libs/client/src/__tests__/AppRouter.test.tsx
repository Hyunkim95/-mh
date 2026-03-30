/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  RouterProvider: ({ router }: { router: { id: string } }) => (
    <div data-testid="router-provider">{router.id}</div>
  ),
}));

vi.mock("../router", () => ({
  router: { id: "app-router" },
}));

import { AppRouter } from "../components/AppRouter";

describe("AppRouter", () => {
  it("renders the RouterProvider with the app router", () => {
    render(<AppRouter />);

    expect(screen.getByTestId("router-provider")).toHaveTextContent(
      "app-router"
    );
  });
});
