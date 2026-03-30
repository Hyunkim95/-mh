/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenConfigForm } from "../components/TokenConfigForm";

describe("TokenConfigForm", () => {
  it("renders initial values and submits converted token config", () => {
    const onSubmit = vi.fn();

    render(
      <TokenConfigForm
        type="SPL"
        creator="creator"
        feeTreasury="treasury-default"
        onSubmit={onSubmit}
        initialValues={{
          feePercentage: "2.5",
          feeTreasury: "treasury-initial",
          maxHops: "9",
          maxDelayHours: "3",
          timelockHours: "4",
          flatFeeSol: "0.5",
        }}
      />
    );

    expect(screen.getByDisplayValue("2.5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("treasury-initial")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("2.5"), {
      target: { value: "1.25" },
    });
    fireEvent.change(screen.getByDisplayValue("treasury-initial"), {
      target: { value: "new-treasury" },
    });
    fireEvent.change(screen.getByDisplayValue("9"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByDisplayValue("4"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByDisplayValue("0.5"), {
      target: { value: "0.25" },
    });

    fireEvent.submit(
      screen.getByRole("button", { name: "Initialize Token Config" })
    );

    expect(onSubmit).toHaveBeenCalledWith({
      tokenConfig: {
        minTransfer: "0",
        feeBps: "12500",
        feeTreasury: "new-treasury",
        maxHops: "7",
        maxDelaySeconds: "10800",
        timelockSeconds: "7200",
        flatFeeLamports: "250000000",
      },
    });
  });

  it("shows loading and error states for update mode", () => {
    render(
      <TokenConfigForm
        type="SOL"
        creator="creator"
        feeTreasury="treasury"
        isUpdate
        isLoading
        error="Something went wrong"
        onSubmit={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Updating..." })
    ).toBeDisabled();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
