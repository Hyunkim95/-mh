/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMobileDevice } from "../hooks/useMobileDevice";

describe("useMobileDevice", () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it("tracks mobile state from the viewport width and responds to resize events", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 500,
    });

    const { result, unmount } = renderHook(() => useMobileDevice());

    expect(result.current.isMobile).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    act(() => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 900,
      });
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isMobile).toBe(false);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});
