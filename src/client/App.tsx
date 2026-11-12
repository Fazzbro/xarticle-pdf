import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardPaste,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  Loader2,
  Moon,
  Printer,
  Sparkles,
  Sun,
  Trash2
} from "lucide-react";
import type { ArticleDocument, RenderOptions } from "../core/types.js";
import { buildPdfFilename } from "../renderer/filename.js";
import { buildArticleHtmlCore } from "../renderer/html-builder-core.js";
import { buildArticleMarkdown } from "../renderer/markdown.js";
import { getClientPreviewFontCss } from "./lib/client-fonts.js";
import { buildClientPdfExportBlob } from "./lib/client-pdf.js";
import { AnimatedBackground } from "./components/motion-primitives/animated-background.js";
import { AnimatedNumber } from "./components/motion-primitives/animated-number.js";
import { BorderTrail } from "./components/motion-primitives/border-trail.js";
import { Disclosure } from "./components/motion-primitives/disclosure.js";
import { Spotlight } from "./components/motion-primitives/spotlight.js";
import { TextEffect } from "./components/motion-primitives/text-effect.js";
import { Badge } from "./components/obsidian/badge.js";
import { Button } from "./components/obsidian/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./components/obsidian/card.js";
import { Kbd, Separator } from "./components/obsidian/kbd.js";
import { RaisedButton } from "./components/obsidian/raised-button.js";
import { Switch } from "./components/obsidian/switch.js";
import { cn } from "./lib/utils.js";

const DEFAULT_OPTIONS: RenderOptions = {
  theme: "editorial",
  paper: "light",
  pageSize: "A4",
  margins: "balanced",
  fontScale: 1,
  includeCover: true,
  includeHeader: true,
  includeRunningHeaderFooter: true,
  includeToc: false,
  includeVideoPoster: false,
  includeStats: false
};

function countInputLinks(text: string): number {
  const matches = text.match(
    /https?:\/\/(?:(?:www\.|mobile\.)?(?:x|twitter|fxtwitter|fixupx|vxtwitter|fixvx)\.com|t\.co)\/[^\s]+/gi
  );
  return matches ? matches.length : 0;
}

function parseFilenameFromHeader(headerVal: string | null, fallback: string): string {
  if (!headerVal) return fallback;
  const match = headerVal.match(/filename="([^"]+)"/i);
  return match ? match[1] : fallback;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function App() {
  const [darkUi, setDarkUi] = useState(false);
  const [health, setHealth] = useState<{
    ready: boolean;
    label: string;
    serverPdfReady: boolean;
    browserFallbackAvailable: boolean;
  }>({
    ready: false,
    label: "Checking engine…",
    serverPdfReady: false,
    browserFallbackAvailable: false
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewSectionRef = useRef<HTMLElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [allowBrowserFallback, setAllowBrowserFallback] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: "info" | "success" | "error" } | null>(
    null
  );

  const [articles, setArticles] = useState<ArticleDocument[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [options, setOptions] = useState<RenderOptions>(DEFAULT_OPTIONS);
  const [previewHtml, setPreviewHtml] = useState("");
  const [zoom, setZoom] = useState<"fit" | "0.85" | "1">("fit");
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );
  const [mobileIframeHeight, setMobileIframeHeight] = useState<number>(640);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const activeArticle = articles[activeIndex] ?? null;
  const detectedLinkCount = useMemo(() => countInputLinks(urlInput), [urlInput]);
  const clientFontCss = useMemo(() => getClientPreviewFontCss(), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkUi);
  }, [darkUi]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        const hasFallback = Boolean(data.browserFallbackAvailable);
        if (!hasFallback) {
          setAllowBrowserFallback(false);
        }
        if (data.browserReady) {
          setHealth({
            ready: true,
            label: "PDF Engine Ready",
            serverPdfReady: true,
            browserFallbackAvailable: hasFallback
          });
        } else if (data.ok && data.clientPdfReady) {
          setHealth({
            ready: true,
            label: "Web PDF Ready",
            serverPdfReady: false,
            browserFallbackAvailable: hasFallback
          });
        } else {
          setHealth({
            ready: true,
            label: "Client PDF Ready",
            serverPdfReady: false,
            browserFallbackAvailable: false
          });
        }
      })
      .catch(() =>
        setHealth({
          ready: true,
          label: "Client PDF Ready",
          serverPdfReady: false,
          browserFallbackAvailable: false
        })
      );
  }, []);

  useEffect(() => {
    if (!activeArticle) {
      setPreviewHtml("");
      return;
    }
    try {
      setPreviewHtml(buildArticleHtmlCore(activeArticle, options, clientFontCss));
    } catch (err) {
      setStatus({
        msg: err instanceof Error ? err.message : "Preview render failed.",
        kind: "error"
      });
    }
  }, [activeArticle, options, clientFontCss]);

  const handleExtract = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setStatus({ msg: "Paste at least one X article or status link.", kind: "error" });
      return;
    }

    setStatus(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: trimmed,
          allowBrowserFallback
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Extraction failed.");
      }
      if (!data.articles || data.articles.length === 0) {
        const msg =
          data.errors?.map((e: { url: string; message: string }) => `${e.url}: ${e.message}`).join(" | ") ||
          "No article content found.";
        throw new Error(msg);
      }

      setArticles(data.articles);
      setActiveIndex(0);

      if (data.errors?.length > 0) {
        setStatus({
          msg: `Extracted ${data.articles.length} article(s). ${data.errors.length} failed.`,
          kind: "error"
        });
      } else {
        setStatus({
          msg: `Extracted ${data.articles.length} article${data.articles.length > 1 ? "s" : ""} cleanly.`,
          kind: "success"
        });
      }
    } catch (err) {
      setStatus({
        msg: err instanceof Error ? err.message : "Extraction failed.",
        kind: "error"
      });
    } finally {
      setExtracting(false);
    }
  }, [urlInput, allowBrowserFallback]);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
      }
    } catch {
      setStatus({ msg: "Clipboard denied — paste directly with Ctrl+V.", kind: "error" });
    }
  };

  const handleClear = () => {
    setUrlInput("");
    setArticles([]);
    setActiveIndex(0);
    setPreviewHtml("");
    setStatus(null);
  };

  const handleExportPdf = async () => {
    if (articles.length === 0) return;
    setExportingPdf(true);
    setStatus(null);
    try {
      if (health.serverPdfReady) {
        try {
          const res = await fetch("/api/export-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: articles.map((doc) => ({ documentId: doc.id, document: doc })),
              options
            })
          });
          if (res.ok) {
            const blob = await res.blob();
            const fallback = articles.length > 1 ? "x-articles-export.zip" : "x-article.pdf";
            const filename = parseFilenameFromHeader(res.headers.get("Content-Disposition"), fallback);
            triggerBlobDownload(blob, filename);
            setStatus({ msg: `Exported ${filename}`, kind: "success" });
            return;
          }
        } catch {
          // Fall through cleanly to browser vector PDF export
        }
      }

      const { blob, filename } = await buildClientPdfExportBlob(articles, options);
      triggerBlobDownload(blob, filename);
      setStatus({ msg: `Exported ${filename}`, kind: "success" });
    } catch (err) {
      setStatus({
        msg: err instanceof Error ? err.message : "PDF export failed.",
        kind: "error"
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportHtml = () => {
    if (!activeArticle) return;
    const html = buildArticleHtmlCore(activeArticle, options, clientFontCss);
    const filename = buildPdfFilename(activeArticle).replace(/\.pdf$/i, ".html");
    triggerBlobDownload(new Blob([html], { type: "text/html;charset=utf-8" }), filename);
  };

  const handleExportMarkdown = () => {
    if (!activeArticle) return;
    const md = buildArticleMarkdown(activeArticle);
    const filename = buildPdfFilename(activeArticle).replace(/\.pdf$/i, ".md");
    triggerBlobDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), filename);
  };

  const handlePrintPreview = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const openPreviewTab = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  };

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const syncHeight = () => {
      const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
      if (h > 200) {
        setMobileIframeHeight(h + 24);
      }
    };
    syncHeight();
    setTimeout(syncHeight, 250);
    setTimeout(syncHeight, 1000);

    doc.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      ev.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    });
  };

  const updateOption = <K extends keyof RenderOptions>(key: K, val: RenderOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--background)] text-[var(--foreground)] lg:h-screen lg:overflow-hidden">
      {/* Top Monochrome Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)]"
            aria-label="XArticle PDF mark"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
              <path
                d="M6.5 3.5h8l4 4v13h-12v-17Z"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinejoin="round"
              />
              <path d="M14.5 3.5v4h4" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
              <path
                d="M9.5 11.25 14.5 16.25M14.5 11.25 9.5 16.25"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <TextEffect as="h1" per="char" preset="fade-in-blur" className="truncate text-sm font-bold tracking-tight">
                XArticle PDF
              </TextEffect>
              <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                v1.0
              </Badge>
            </div>
            <span className="hidden text-[11px] text-[var(--muted-foreground)] sm:block">
              Monochrome Editorial Exporter
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <Badge id="healthBadge" variant="outline" className="gap-1.5 whitespace-nowrap py-1">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                health.ready ? "bg-[var(--foreground)]" : "bg-[var(--muted-foreground)]"
              )}
            />
            <span>{health.label}</span>
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setDarkUi((d) => !d)}
            title={darkUi ? "Switch to Paper White UI" : "Switch to Obsidian Black UI"}
            aria-label="Toggle monochrome theme"
          >
            {darkUi ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[400px_1fr]">
        {/* Left Control Sidebar */}
        <aside className="flex flex-col border-b border-[var(--border)] bg-[var(--card)] lg:min-h-0 lg:border-r lg:border-b-0">
          <div className="space-y-3.5 p-4 lg:flex-1 lg:overflow-y-auto">
            {/* Step 1: Paste Links */}
            <Card className="overflow-hidden">
              <Spotlight />
              {extracting && <BorderTrail size={84} duration={2.2} />}
              <CardHeader>
                <CardTitle>1. Paste X Article Link(s)</CardTitle>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={handlePasteClipboard}>
                    <ClipboardPaste />
                    Paste
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                    <Trash2 />
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  id="urlInput"
                  rows={4}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      handleExtract();
                    }
                  }}
                  placeholder={"https://x.com/username/status/1234567890\nhttps://x.com/username/article/1234567890"}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:outline-none"
                />

                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1.5">
                    {detectedLinkCount > 0 ? (
                      <>
                        <Check className="h-3 w-3 text-[var(--foreground)]" />
                        <span className="font-medium text-[var(--foreground)]">
                          {detectedLinkCount} X link{detectedLinkCount > 1 ? "s" : ""} detected
                        </span>
                      </>
                    ) : (
                      <>
                        <span>Extract with</span>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>Enter</Kbd>
                      </>
                    )}
                  </span>

                  <label
                    className={cn(
                      "flex items-center gap-2",
                      health.browserFallbackAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                    )}
                    title={
                      health.browserFallbackAvailable
                        ? "Fallback to local ego-browser when public X API is blocked"
                        : "Web mode uses public X API extraction (local browser fallback runs in CLI)"
                    }
                  >
                    <span>Browser fallback</span>
                    <Switch
                      checked={allowBrowserFallback}
                      disabled={!health.browserFallbackAvailable}
                      onCheckedChange={setAllowBrowserFallback}
                      label="Browser fallback"
                    />
                  </label>
                </div>

                <RaisedButton
                  id="extractBtn"
                  type="button"
                  onClick={handleExtract}
                  disabled={extracting}
                  className="w-full"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extracting &amp; Hydrating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Extract &amp; Format Article
                    </>
                  )}
                </RaisedButton>

                {status && (
                  <div
                    id="statusBanner"
                    role="status"
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs leading-snug",
                      status.kind === "error"
                        ? "border-[var(--foreground)] bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                    )}
                  >
                    <span>{status.msg}</span>
                    {!isDesktop && previewHtml && status.kind === "success" && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="shrink-0"
                        onClick={() =>
                          previewSectionRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                          })
                        }
                      >
                        Read Article ↓
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Extracted Summary & Metrics */}
            {activeArticle && (
              <Card id="articlesSection">
                <CardHeader>
                  <CardTitle>2. Extracted Content</CardTitle>
                  <Badge id="sourceBadge" variant="secondary" className="font-mono text-[10px]">
                    via {activeArticle.diagnostics.source}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    {articles.map((doc, idx) => {
                      const active = idx === activeIndex;
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setActiveIndex(idx)}
                          className={cn(
                            "w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-all",
                            active
                              ? "border-[var(--foreground)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--accent)]"
                          )}
                        >
                          <div className="truncate text-xs font-semibold">{doc.title}</div>
                          <div
                            className={cn(
                              "mt-0.5 text-[11px]",
                              active ? "opacity-75" : "text-[var(--muted-foreground)]"
                            )}
                          >
                            @{doc.author.handle} · {doc.diagnostics.wordCount.toLocaleString()} words
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div id="metricsGrid" className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5">
                      <div className="text-sm font-bold tracking-tight">
                        <AnimatedNumber value={activeArticle.diagnostics.wordCount} />
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        Words ({activeArticle.diagnostics.readingTimeMinutes} min)
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5">
                      <div className="text-sm font-bold tracking-tight">
                        <AnimatedNumber value={activeArticle.diagnostics.imageCount} />
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">Images</div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5">
                      <div className="text-sm font-bold tracking-tight">
                        <AnimatedNumber value={activeArticle.diagnostics.videoLinkCount} />
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">Video Links</div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5">
                      <div className="text-sm font-bold tracking-tight">
                        <AnimatedNumber value={activeArticle.diagnostics.embeddedPostCount} />
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        Posts ({activeArticle.diagnostics.embeddedPostsWithoutImagesCount} text-only)
                      </div>
                    </div>
                  </div>

                  {activeArticle.diagnostics.warnings.length > 0 && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                      {activeArticle.diagnostics.warnings.join(" • ")}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 3: Layout & Typography */}
            <Disclosure title="3. Layout & Typography" defaultOpen>
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-[var(--muted-foreground)]">Typography</span>
                    <select
                      value={options.theme}
                      onChange={(e) => updateOption("theme", e.target.value as RenderOptions["theme"])}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none"
                    >
                      <option value="editorial">Editorial Serif</option>
                      <option value="sans">Modern Sans</option>
                      <option value="technical">Technical Mono</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[11px] text-[var(--muted-foreground)]">Paper</span>
                    <select
                      value={options.paper}
                      onChange={(e) => updateOption("paper", e.target.value as RenderOptions["paper"])}
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none"
                    >
                      <option value="light">Crisp White</option>
                      <option value="ivory">Warm Ivory</option>
                      <option value="dark">Obsidian Black</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[11px] text-[var(--muted-foreground)]">Page Size</span>
                    <select
                      value={options.pageSize}
                      onChange={(e) =>
                        updateOption("pageSize", e.target.value as RenderOptions["pageSize"])
                      }
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none"
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">US Letter</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[11px] text-[var(--muted-foreground)]">Margins</span>
                    <select
                      value={options.margins}
                      onChange={(e) =>
                        updateOption("margins", e.target.value as RenderOptions["margins"])
                      }
                      className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none"
                    >
                      <option value="compact">Compact (14mm)</option>
                      <option value="balanced">Balanced (18mm)</option>
                      <option value="generous">Generous (22mm)</option>
                    </select>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--muted-foreground)]">Font Scale</span>
                    <span className="font-mono font-medium">
                      {Math.round(options.fontScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.25}
                    step={0.05}
                    value={options.fontScale}
                    onChange={(e) => updateOption("fontScale", Number(e.target.value))}
                    className="w-full accent-[var(--foreground)]"
                  />
                </div>

                <Separator />

                <div className="space-y-2.5">
                  {(
                    [
                      ["includeCover", "Include cover image"],
                      ["includeHeader", "Include title & author byline"],
                      ["includeRunningHeaderFooter", "Running header & page numbers"],
                      ["includeToc", "Table of contents"],
                      ["includeVideoPoster", "Static thumbnail on video link card"],
                      ["includeStats", "Engagement stats (likes/views)"]
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--foreground)]">{label}</span>
                      <Switch
                        checked={options[key]}
                        onCheckedChange={(checked) => updateOption(key, checked)}
                        label={label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Disclosure>
          </div>

          {/* Sticky Bottom Export Bar */}
          <div className="space-y-2 border-t border-[var(--border)] bg-[var(--card)] p-4 lg:sticky lg:bottom-0 lg:z-10">
            <RaisedButton
              id="exportPdfBtn"
              type="button"
              onClick={handleExportPdf}
              disabled={!activeArticle || exportingPdf}
              className="w-full"
            >
              {exportingPdf ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Rendering PDF…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {articles.length > 1 ? `Export All ${articles.length} PDFs (.zip)` : "Export PDF"}
                </>
              )}
            </RaisedButton>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!activeArticle}
                onClick={handleExportHtml}
              >
                <FileCode />
                HTML
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!activeArticle}
                onClick={handleExportMarkdown}
              >
                <FileText />
                Markdown
              </Button>
            </div>
          </div>
        </aside>

        {/* Right Live Print Preview Canvas */}
        <section
          ref={previewSectionRef}
          id="previewSection"
          className="flex min-h-[75dvh] min-w-0 flex-col bg-[var(--canvas)] lg:min-h-0"
        >
          <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-1.5 sm:px-4">
            <div id="previewTitle" className="min-w-0 flex-1 truncate text-xs font-semibold">
              {activeArticle ? activeArticle.title : "Live Print Preview"}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                <AnimatedBackground
                  value={zoom}
                  onValueChange={(v) => setZoom(v as "fit" | "0.85" | "1")}
                >
                  {[
                    { id: "fit", label: "Fit" },
                    { id: "0.85", label: "85%" },
                    { id: "1", label: "100%" }
                  ].map((item) => (
                    <button
                      key={item.id}
                      data-id={item.id}
                      type="button"
                      className={cn(
                        "cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                        zoom === item.id
                          ? "text-[var(--primary-foreground)]"
                          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </AnimatedBackground>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!previewHtml}
                onClick={handlePrintPreview}
                title="Browser Print / Save as PDF"
              >
                <Printer />
                Print
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!previewHtml}
                onClick={openPreviewTab}
              >
                <ExternalLink />
                Open Tab
              </Button>
            </div>
          </div>

          {!previewHtml ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <Card className="w-full max-w-md overflow-hidden p-7 text-center">
                <Spotlight size={240} />
                <div
                  className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  aria-label="Editorial PDF geometric emblem"
                >
                  <span className="pointer-events-none absolute top-2 left-2 h-2 w-2 border-t border-l border-[var(--muted-foreground)] opacity-50" />
                  <span className="pointer-events-none absolute top-2 right-2 h-2 w-2 border-t border-r border-[var(--muted-foreground)] opacity-50" />
                  <span className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l border-[var(--muted-foreground)] opacity-50" />
                  <span className="pointer-events-none absolute right-2 bottom-2 h-2 w-2 border-r border-b border-[var(--muted-foreground)] opacity-50" />
                  <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden="true">
                    <rect
                      x="18"
                      y="10"
                      width="32"
                      height="42"
                      rx="2"
                      stroke="currentColor"
                      strokeOpacity="0.22"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M14 14h24l8 8v30H14V14Z"
                      fill="var(--card)"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                    />
                    <path d="M38 14v8h8" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                    <rect x="20" y="21" width="12" height="12" rx="2" fill="currentColor" />
                    <path
                      d="M23.5 24.5 28.5 29.5M28.5 24.5 23.5 29.5"
                      stroke="var(--background)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M20 38h20M20 42.5h20M20 47h12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <Badge variant="secondary" className="mb-3">
                  Monochrome Print Studio
                </Badge>
                <TextEffect as="h2" per="word" preset="slide" className="text-lg font-bold tracking-tight">
                  Paste any X Article link to begin
                </TextEffect>
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                  Preserves headings, lists, code blocks, images, and text-only embedded posts.
                  Videos and GIFs become clickable Watch on X link cards.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {[
                    "x.com/<user>/status/<id>",
                    "x.com/<user>/article/<id>",
                    "x.com/i/article/<id>"
                  ].map((fmt) => (
                    <code
                      key={fmt}
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[10px] text-[var(--muted-foreground)]"
                    >
                      {fmt}
                    </code>
                  ))}
                </div>
              </Card>
            </div>
          ) : (
            <div className="relative flex-1 overflow-auto lg:min-h-0">
              <iframe
                ref={iframeRef}
                id="previewFrame"
                title="Article Print Preview"
                srcDoc={previewHtml}
                onLoad={handleIframeLoad}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals"
                className="w-full origin-top border-0 bg-[#eaecef] lg:h-full"
                style={
                  isDesktop
                    ? zoom === "fit"
                      ? undefined
                      : {
                          transform: `scale(${zoom})`,
                          width: `${(100 / Number(zoom)).toFixed(2)}%`,
                          height: `${(100 / Number(zoom)).toFixed(2)}%`
                        }
                    : zoom === "fit"
                      ? { height: `${mobileIframeHeight}px`, minHeight: "75dvh" }
                      : {
                          transform: `scale(${zoom})`,
                          width: `${(100 / Number(zoom)).toFixed(2)}%`,
                          height: `${mobileIframeHeight}px`,
                          minHeight: "75dvh"
                        }
                }
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
