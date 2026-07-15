import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownResponse } from "./markdown-response";

describe("MarkdownResponse", () => {
  it("renders CJK markdown without rendering raw HTML", () => {
    const { container } = render(
      <MarkdownResponse content={'**重要提示（AI）：**请检查。<script>alert("x")</script>'} />,
    );

    expect(screen.getByText("重要提示（AI）：")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
  });
});
