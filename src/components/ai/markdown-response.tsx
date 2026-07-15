"use client";

import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { Streamdown, defaultUrlTransform } from "streamdown";
import { cn } from "@/lib/utils";

type MarkdownResponseProps = {
  content: string;
  streaming?: boolean;
  className?: string;
};

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const safeUrlTransform: typeof defaultUrlTransform = (url, key, node) => {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol)
      ? defaultUrlTransform(url, key, node)
      : "";
  } catch {
    return "";
  }
};

export function MarkdownResponse({
  content,
  streaming = false,
  className,
}: MarkdownResponseProps) {
  return (
    <Streamdown
      className={cn("text-sm leading-6 text-slate-800", className)}
      controls={{ code: { download: false } }}
      isAnimating={streaming}
      mode={streaming ? "streaming" : "static"}
      plugins={{ cjk, code }}
      skipHtml
      urlTransform={safeUrlTransform}
    >
      {content}
    </Streamdown>
  );
}
