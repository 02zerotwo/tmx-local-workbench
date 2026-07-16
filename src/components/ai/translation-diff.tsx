"use client";

import { useMemo } from "react";
import { diffTokens } from "@/lib/text-diff";

type TranslationDiffProps = {
  before: string;
  after: string;
};

/** 原译文 → 建议译文的逐字/词高亮对比：删除标红删除线，新增标绿。 */
export function TranslationDiff({ before, after }: TranslationDiffProps) {
  const segments = useMemo(() => diffTokens(before, after), [before, after]);

  return (
    <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-800">
      {segments.map((segment, index) => {
        if (segment.type === "equal") {
          return <span key={index}>{segment.text}</span>;
        }
        if (segment.type === "delete") {
          return (
            <span
              className="rounded-sm bg-red-100 text-red-700 line-through decoration-red-400"
              key={index}
            >
              {segment.text}
            </span>
          );
        }
        return (
          <span
            className="rounded-sm bg-emerald-100 text-emerald-800"
            key={index}
          >
            {segment.text}
          </span>
        );
      })}
    </p>
  );
}
