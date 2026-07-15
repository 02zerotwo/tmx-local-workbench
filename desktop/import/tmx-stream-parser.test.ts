import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  parseTmxStream,
  type StreamedTranslationPair,
} from "./tmx-stream-parser";

function awkwardByteChunks(value: string): Uint8Array[] {
  const bytes = new TextEncoder().encode(value);
  return splitBytes(bytes);
}

function splitBytes(bytes: Uint8Array): Uint8Array[] {
  const pattern = [1, 2, 5, 3, 8, 1, 13, 4, 2, 7];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let patternIndex = 0;

  while (offset < bytes.length) {
    const size = pattern[patternIndex % pattern.length];
    chunks.push(bytes.slice(offset, offset + size));
    offset += size;
    patternIndex += 1;
  }

  return chunks;
}

async function parse(
  xml: string,
  chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array> = awkwardByteChunks(xml),
) {
  const pairs: StreamedTranslationPair[] = [];
  const summary = await parseTmxStream(chunks, {
    onPair: (pair) => pairs.push(pair),
  });

  return { pairs, summary };
}

describe("parseTmxStream", () => {
  it("streams header language, direct metadata, entities, inline code, and multiple targets", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <tmx version="1.4">
        <header srclang="en-US" />
        <body>
          <tu tuid="welcome">
            <prop type="domain">controls &amp; alarms</prop>
            <group><prop type="nested">ignore me</prop></group>
            <tuv xml:lang="zh-CN"><seg>你好 &amp; 再见</seg></tuv>
            <tuv xml:lang="en-US"><seg>Hello <bpt i="1">&lt;b&gt;</bpt>world<ept i="1">&lt;/b&gt;</ept></seg></tuv>
            <tuv xml:lang="de-DE"><seg>Hallo Welt</seg></tuv>
          </tu>
        </body>
      </tmx>`;

    const { pairs, summary } = await parse(xml);

    expect(pairs).toEqual([
      {
        pairOrdinal: 1,
        unitOrdinal: 1,
        targetOrdinal: 1,
        id: "welcome",
        sourceLang: "en-US",
        sourceText: "Hello world",
        targetLang: "zh-CN",
        targetText: "你好 & 再见",
        metadata: { domain: "controls & alarms" },
      },
      {
        pairOrdinal: 2,
        unitOrdinal: 1,
        targetOrdinal: 2,
        id: "welcome",
        sourceLang: "en-US",
        sourceText: "Hello world",
        targetLang: "de-DE",
        targetText: "Hallo Welt",
        metadata: { domain: "controls & alarms" },
      },
    ]);
    expect(summary).toEqual({
      sourceLanguage: "en-US",
      targetLanguages: ["de-DE", "zh-CN"],
      totalTranslationUnits: 1,
      emittedPairs: 2,
      skippedRows: 0,
      processedBytes: new TextEncoder().encode(xml).byteLength,
    });
  });

  it("uses the first TUV as source when the header has no source language", async () => {
    const { pairs, summary } = await parse(`
      <tmx version="1.4"><header /><body>
        <tu><tuv lang="ja-JP"><seg>保存</seg></tuv><tuv lang="en-US"><seg>Save</seg></tuv></tu>
      </body></tmx>
    `);

    expect(summary.sourceLanguage).toBe("ja-JP");
    expect(pairs[0]).toMatchObject({
      id: "1",
      unitOrdinal: 1,
      targetOrdinal: 1,
      sourceLang: "ja-JP",
      sourceText: "保存",
      targetLang: "en-US",
      targetText: "Save",
    });
  });

  it("emits pairs before the input ends and keeps empty targets", async () => {
    const firstHalf = `<tmx version="1.4"><header srclang="en"/><body>
      <tu tuid="first"><tuv xml:lang="en"><seg>Save</seg></tuv><tuv xml:lang="zh"><seg></seg></tuv></tu>`;
    const secondHalf = `
      <tu tuid="second"><tuv xml:lang="en"><seg>Close</seg></tuv><tuv xml:lang="zh"><seg>关闭</seg></tuv></tu>
      </body></tmx>`;
    const pairs: StreamedTranslationPair[] = [];

    async function* chunks() {
      yield firstHalf;
      expect(pairs.map(({ id }) => id)).toEqual(["first"]);
      yield secondHalf;
    }

    const summary = await parseTmxStream(chunks(), {
      onPair: (pair) => pairs.push(pair),
    });

    expect(pairs[0].targetText).toBe("");
    expect(summary.emittedPairs).toBe(2);
  });

  it("counts code-like and invalid pairs while preserving natural labels", async () => {
    const { pairs, summary } = await parse(`
      <tmx version="1.4"><header srclang="zh-CN"/><body>
        <tu tuid="style"><tuv xml:lang="zh-CN"><seg>&lt;font latin=&quot;x&quot; typeface=&quot;y&quot;&gt;</seg></tuv><tuv xml:lang="en-US"><seg>style</seg></tuv></tu>
        <tu tuid="code-only-language"><tuv xml:lang="zh-CN"><seg>&lt;fill-sd val=&quot;x&quot;&gt;</seg></tuv><tuv xml:lang="fr-FR"><seg>&lt;fill-sd val=&quot;y&quot;&gt;</seg></tuv></tu>
        <tu tuid="empty-source"><tuv xml:lang="zh-CN"><seg></seg></tuv><tuv xml:lang="en-US"><seg>Missing</seg></tuv></tu>
        <tu tuid="alarm"><tuv xml:lang="zh-CN"><seg>{}报警 333{}</seg></tuv><tuv xml:lang="en-US"><seg>{}Alarm 333{}</seg></tuv></tu>
      </body></tmx>
    `);

    expect(pairs.map(({ id }) => id)).toEqual(["alarm"]);
    expect(pairs[0]).toMatchObject({ sourceText: "报警 333", targetText: "Alarm 333" });
    expect(summary).toMatchObject({
      targetLanguages: ["en-US"],
      skippedRows: 3,
      emittedPairs: 1,
    });
  });

  it("accepts a Node readable and preserves UTF-8 text split across bytes", async () => {
    const xml = `<tmx version="1.4"><header srclang="zh"/><body><tu><tuv xml:lang="zh"><seg>扫描校验</seg></tuv><tuv xml:lang="en"><seg>Scanning</seg></tuv></tu></body></tmx>`;
    const readable = Readable.from(awkwardByteChunks(xml));
    const { pairs } = await parse(xml, readable);

    expect(pairs[0].sourceText).toBe("扫描校验");
  });

  it("detects a UTF-16LE BOM and streams text split across code units", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-16"?>
      <tmx version="1.4"><header srclang="zh-CN"/><body>
        <tu><tuv xml:lang="zh-CN"><seg>报警复位</seg></tuv><tuv xml:lang="en-US"><seg>Reset alarm</seg></tuv></tu>
      </body></tmx>`;
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(xml, "utf16le"),
    ]);

    const { pairs, summary } = await parse(xml, splitBytes(bytes));

    expect(pairs[0]).toMatchObject({
      sourceText: "报警复位",
      targetText: "Reset alarm",
    });
    expect(summary.processedBytes).toBe(bytes.byteLength);
  });

  it("honors a GBK XML encoding declaration", async () => {
    const prefix = Buffer.from(`<?xml version="1.0" encoding="GBK"?>
      <tmx version="1.4"><header srclang="zh-CN"/><body>
        <tu><tuv xml:lang="zh-CN"><seg>`, "ascii");
    const gbkSource = Buffer.from([
      0xb1, 0xa8, 0xbe, 0xaf, 0xb8, 0xb4, 0xce, 0xbb,
    ]);
    const suffix = Buffer.from(`</seg></tuv><tuv xml:lang="en-US"><seg>Reset alarm</seg></tuv></tu>
      </body></tmx>`, "ascii");
    const bytes = Buffer.concat([prefix, gbkSource, suffix]);

    const { pairs } = await parse("", splitBytes(bytes));

    expect(pairs[0]).toMatchObject({
      sourceText: "报警复位",
      targetText: "Reset alarm",
    });
  });

  it("honors a windows-1252 XML encoding declaration", async () => {
    const prefix = Buffer.from(`<?xml version="1.0" encoding="windows-1252"?>
      <tmx version="1.4"><header srclang="fr-FR"/><body>
        <tu><tuv xml:lang="fr-FR"><seg>Caf`, "ascii");
    const encodedText = Buffer.from([0xe9]);
    const suffix = Buffer.from(`</seg></tuv><tuv xml:lang="en-US"><seg>Coffee</seg></tuv></tu>
      </body></tmx>`, "ascii");
    const bytes = Buffer.concat([prefix, encodedText, suffix]);

    const { pairs } = await parse("", splitBytes(bytes));

    expect(pairs[0]).toMatchObject({ sourceText: "Café", targetText: "Coffee" });
  });

  it("reports malformed XML with a readable Chinese error", async () => {
    await expect(parse("<tmx><body><tu></body></tmx>"))
      .rejects.toThrow(/TMX XML 格式有误/);
  });

  it("reports a missing TMX body", async () => {
    await expect(parse("<tmx><header srclang=\"en\"/></tmx>"))
      .rejects.toThrow("没有找到 TMX body");
  });

  it("reports a missing header-selected source TUV", async () => {
    await expect(parse(`
      <tmx><header srclang="en-US"/><body>
        <tu tuid="missing-source"><tuv xml:lang="zh-CN"><seg>你好</seg></tuv></tu>
      </body></tmx>
    `)).rejects.toThrow(/翻译单元 missing-source 缺少源语言 en-US/);
  });
});
