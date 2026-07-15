import { SaxesParser, type SaxesTagPlain } from "saxes";
import {
  cleanTranslationText,
  isInlineCodeTag,
  shouldSkipTranslationPair,
} from "../../src/lib/text-cleaning";

export type TmxChunk = string | Uint8Array;

export type StreamedTranslationPair = {
  pairOrdinal: number;
  unitOrdinal: number;
  targetOrdinal: number;
  id: string;
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  targetText: string;
  metadata: Record<string, string>;
};

export type TmxStreamSummary = {
  sourceLanguage: string;
  targetLanguages: string[];
  totalTranslationUnits: number;
  emittedPairs: number;
  skippedRows: number;
  processedBytes: number;
};

export type ParseTmxStreamOptions = {
  onPair: (pair: StreamedTranslationPair) => void;
  onBytes?: (processedBytes: number) => void;
};

type ParsedTuv = {
  language: string;
  segment: string;
};

type CurrentTu = {
  id: string;
  unitOrdinal: number;
  metadata: Record<string, string>;
  tuvs: ParsedTuv[];
};

type CurrentProp = {
  key: string;
  text: string;
};

const ENCODING_SNIFF_LIMIT = 1_024;

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function normalizeEncoding(label: string): string {
  const normalized = label.trim().toLowerCase().replaceAll("_", "-");
  const compact = normalized.replace(/[\s-]/g, "");

  if (["gbk", "gb2312", "gb231280", "cp936", "ms936", "windows936"].includes(compact)) {
    return "gb18030";
  }
  if (["utf16", "utf16le", "unicode"].includes(compact)) {
    return "utf-16le";
  }
  if (["utf16be", "unicodefffe"].includes(compact)) {
    return "utf-16be";
  }
  if (["shiftjis", "sjis", "x-sjis"].includes(compact)) {
    return "shift_jis";
  }
  if (compact === "ansi") {
    return "windows-1252";
  }

  return normalized;
}

function sniffEncoding(bytes: Uint8Array, final: boolean): string | null {
  if (bytes.byteLength >= 4) {
    if (
      startsWithBytes(bytes, [0x00, 0x00, 0xfe, 0xff])
      || startsWithBytes(bytes, [0xff, 0xfe, 0x00, 0x00])
    ) {
      throw new Error("不支持的 TMX 文件编码：UTF-32，请先另存为 UTF-8 或 UTF-16");
    }
    if (startsWithBytes(bytes, [0xff, 0xfe])) {
      return "utf-16le";
    }
    if (startsWithBytes(bytes, [0xfe, 0xff])) {
      return "utf-16be";
    }
    if (startsWithBytes(bytes, [0x3c, 0x00, 0x3f, 0x00])) {
      return "utf-16le";
    }
    if (startsWithBytes(bytes, [0x00, 0x3c, 0x00, 0x3f])) {
      return "utf-16be";
    }
  }
  if (bytes.byteLength >= 3 && startsWithBytes(bytes, [0xef, 0xbb, 0xbf])) {
    return "utf-8";
  }

  const sample = bytes.subarray(0, ENCODING_SNIFF_LIMIT);
  const ascii = String.fromCharCode(...sample);
  const trimmed = ascii.trimStart();
  const declarationStart = trimmed.match(/^<\?xml\b/i);

  if (declarationStart) {
    const declarationEnd = trimmed.indexOf("?>");
    const declaration = declarationEnd === -1
      ? trimmed
      : trimmed.slice(0, declarationEnd + 2);
    const declaredEncoding = declaration.match(
      /\bencoding\s*=\s*["']\s*([^"']+?)\s*["']/i,
    )?.[1];
    if (declaredEncoding) {
      return normalizeEncoding(declaredEncoding);
    }
    if (declarationEnd !== -1) {
      return "utf-8";
    }
  } else if (trimmed.startsWith("<")) {
    const declarationPrefix = "<?xml";
    if (!final && declarationPrefix.startsWith(trimmed.toLowerCase())) {
      return null;
    }
    return "utf-8";
  }

  if (final || bytes.byteLength >= ENCODING_SNIFF_LIMIT) {
    return "utf-8";
  }

  return null;
}

function joinChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return joined;
}

function createDecoder(encoding: string): TextDecoder {
  try {
    return new TextDecoder(encoding, { fatal: true });
  } catch {
    throw new Error(
      `不支持的 TMX 文件编码：${encoding}，请先将文件另存为 UTF-8`,
    );
  }
}

function localName(name: string): string {
  const separator = name.lastIndexOf(":");
  return (separator === -1 ? name : name.slice(separator + 1)).toLowerCase();
}

function getAttribute(tag: SaxesTagPlain, name: string): string {
  return tag.attributes[name] ?? "";
}

function readableXmlError(error: unknown): Error {
  if (error instanceof Error && (
    error.message.startsWith("TMX XML 格式有误")
    || error.message.startsWith("没有找到 TMX body")
    || error.message.startsWith("翻译单元")
    || error.message.startsWith("不支持的 TMX 文件编码")
  )) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new Error(`TMX XML 格式有误：${message}`);
}

export async function parseTmxStream(
  chunks: AsyncIterable<TmxChunk> | Iterable<TmxChunk>,
  options: ParseTmxStreamOptions,
): Promise<TmxStreamSummary> {
  const parser = new SaxesParser({ xmlns: false, position: true });
  const encoder = new TextEncoder();
  const pendingChunks: Uint8Array[] = [];
  const tagStack: string[] = [];
  const targetLanguages = new Set<string>();
  let headerSourceLanguage = "";
  let discoveredSourceLanguage = "";
  let sawBody = false;
  let inBody = false;
  let currentTu: CurrentTu | null = null;
  let currentTuv: ParsedTuv | null = null;
  let currentProp: CurrentProp | null = null;
  let inSegment = false;
  let ignoredInlineDepth = 0;
  let totalTranslationUnits = 0;
  let emittedPairs = 0;
  let skippedRows = 0;
  let processedBytes = 0;
  let parserError: Error | null = null;
  let semanticError: Error | null = null;
  let callbackFailed = false;
  let callbackError: unknown;
  let pendingLength = 0;
  let decoder: TextDecoder | null = null;

  const appendText = (text: string) => {
    if (currentProp) {
      currentProp.text += text;
    }

    if (inSegment && currentTuv && ignoredInlineDepth === 0) {
      currentTuv.segment += text;
    }
  };

  const finishTranslationUnit = () => {
    if (!currentTu || semanticError) {
      return;
    }

    const unit = currentTu;
    const requestedSource = headerSourceLanguage.trim();
    const sourceIndex = requestedSource
      ? unit.tuvs.findIndex(({ language }) => (
        language.toLocaleLowerCase() === requestedSource.toLocaleLowerCase()
      ))
      : 0;

    if (sourceIndex < 0 || !unit.tuvs[sourceIndex]) {
      if (requestedSource) {
        semanticError = new Error(
          `翻译单元 ${unit.id} 缺少源语言 ${requestedSource} 的 TUV`,
        );
        return;
      }

      semanticError = new Error(`翻译单元 ${unit.id} 缺少源文本 TUV`);
      return;
    }

    const sourceTuv = unit.tuvs[sourceIndex];
    const sourceLang = sourceTuv.language || requestedSource || "unknown";
    const sourceText = cleanTranslationText(sourceTuv.segment);
    let targetOrdinal = 0;

    if (!discoveredSourceLanguage) {
      discoveredSourceLanguage = sourceLang;
    }

    for (let index = 0; index < unit.tuvs.length; index += 1) {
      if (index === sourceIndex) {
        continue;
      }

      targetOrdinal += 1;
      const targetTuv = unit.tuvs[index];
      const targetLang = targetTuv.language || "unknown";
      const targetText = cleanTranslationText(targetTuv.segment);

      if (shouldSkipTranslationPair(sourceText, targetText)) {
        skippedRows += 1;
        continue;
      }

      targetLanguages.add(targetLang);
      emittedPairs += 1;
      try {
        options.onPair({
          pairOrdinal: emittedPairs,
          unitOrdinal: unit.unitOrdinal,
          targetOrdinal,
          id: unit.id,
          sourceLang,
          sourceText,
          targetLang,
          targetText,
          metadata: { ...unit.metadata },
        });
      } catch (error) {
        callbackFailed = true;
        callbackError = error;
        throw error;
      }
    }
  };

  parser.on("opentag", (tag) => {
    const name = localName(tag.name);
    const parent = tagStack[tagStack.length - 1];
    tagStack.push(name);

    if (name === "header" && parent === "tmx") {
      headerSourceLanguage = getAttribute(tag, "srclang").trim();
      return;
    }

    if (name === "body" && parent === "tmx") {
      sawBody = true;
      inBody = true;
      return;
    }

    if (name === "tu" && inBody && parent === "body") {
      totalTranslationUnits += 1;
      currentTu = {
        id: getAttribute(tag, "tuid").trim() || String(totalTranslationUnits),
        unitOrdinal: totalTranslationUnits,
        metadata: {},
        tuvs: [],
      };
      return;
    }

    if (name === "prop" && currentTu && parent === "tu") {
      const fallbackIndex = Object.keys(currentTu.metadata).length + 1;
      currentProp = {
        key: getAttribute(tag, "type").trim() || `prop_${fallbackIndex}`,
        text: "",
      };
      return;
    }

    if (name === "tuv" && currentTu && parent === "tu") {
      currentTuv = {
        language: (
          getAttribute(tag, "xml:lang") || getAttribute(tag, "lang")
        ).trim(),
        segment: "",
      };
      return;
    }

    if (name === "seg" && currentTuv && parent === "tuv") {
      inSegment = true;
      ignoredInlineDepth = 0;
      return;
    }

    if (inSegment && isInlineCodeTag(name)) {
      ignoredInlineDepth += 1;
    }
  });

  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("error", (error) => {
    parserError = readableXmlError(error);
  });

  parser.on("closetag", (tag) => {
    if (parserError) {
      throw parserError;
    }

    const name = localName(tag.name);

    if (inSegment && isInlineCodeTag(name) && ignoredInlineDepth > 0) {
      ignoredInlineDepth -= 1;
    } else if (name === "seg" && inSegment) {
      inSegment = false;
      ignoredInlineDepth = 0;
    } else if (name === "tuv" && currentTu && currentTuv) {
      currentTu.tuvs.push(currentTuv);
      currentTuv = null;
    } else if (name === "prop" && currentTu && currentProp) {
      currentTu.metadata[currentProp.key] = currentProp.text.trim();
      currentProp = null;
    } else if (name === "tu" && currentTu) {
      finishTranslationUnit();
      currentTu = null;
    } else if (name === "body") {
      inBody = false;
    }

    tagStack.pop();
  });

  try {
    for await (const chunk of chunks) {
      const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
      processedBytes += bytes.byteLength;
      options.onBytes?.(processedBytes);

      let text = "";
      if (decoder) {
        text = decoder.decode(bytes, { stream: true });
      } else {
        pendingChunks.push(bytes);
        pendingLength += bytes.byteLength;
        const pendingBytes = joinChunks(pendingChunks, pendingLength);
        const encoding = sniffEncoding(pendingBytes, false);
        if (encoding) {
          decoder = createDecoder(encoding);
          text = decoder.decode(pendingBytes, { stream: true });
          pendingChunks.length = 0;
          pendingLength = 0;
        }
      }

      if (text) {
        parser.write(text);
      }
      if (parserError) {
        throw parserError;
      }
    }

    if (!decoder) {
      const pendingBytes = joinChunks(pendingChunks, pendingLength);
      decoder = createDecoder(sniffEncoding(pendingBytes, true) ?? "utf-8");
      const text = decoder.decode(pendingBytes, { stream: true });
      if (text) {
        parser.write(text);
      }
    }
    const tail = decoder.decode();
    if (tail) {
      parser.write(tail);
    }
    parser.close();
    if (parserError) {
      throw parserError;
    }
  } catch (error) {
    if (callbackFailed) {
      throw callbackError;
    }

    throw readableXmlError(error);
  }

  if (!sawBody) {
    throw new Error("没有找到 TMX body");
  }

  if (semanticError) {
    throw semanticError;
  }

  return {
    sourceLanguage: headerSourceLanguage || discoveredSourceLanguage,
    targetLanguages: Array.from(targetLanguages).sort((left, right) => (
      left.localeCompare(right)
    )),
    totalTranslationUnits,
    emittedPairs,
    skippedRows,
    processedBytes,
  };
}
