import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("next/image", () => ({
  default(props: Record<string, unknown>) {
    const { alt = "", src, fill: _ignored, ...rest } = props;
    return React.createElement("img", {
      alt: String(alt),
      src: typeof src === "string" ? src : undefined,
      ...(rest as object),
    });
  },
}));
