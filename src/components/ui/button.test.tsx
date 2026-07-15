import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders an accessible button and forwards clicks", () => {
    const onClick = vi.fn();

    render(
      <Button aria-label="开始审查" onClick={onClick}>
        开始
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始审查" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
