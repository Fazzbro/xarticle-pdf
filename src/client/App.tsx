import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  ClipboardPaste,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  Loader2,
  Minus,
  Moon,
  Plus,
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
import { AnimatedGroup } from "./components/motion-primitives/animated-group.js";
import { AnimatedNumber } from "./components/motion-primitives/animated-number.js";
import { BorderTrail } from "./components/motion-primitives/border-trail.js";
import { Disclosure } from "./components/motion-primitives/disclosure.js";
import { Magnetic } from "./components/motion-primitives/magnetic.js";
import { SlidingNumber } from "./components/motion-primitives/sliding-number.js";
import { Spotlight } from "./components/motion-primitives/spotlight.js";
import { TextEffect } from "./components/motion-primitives/text-effect.js";
import { TextMorph } from "./components/motion-primitives/text-morph.js";
import { TextShimmer } from "./components/motion-primitives/text-shimmer.js";
import { Tilt } from "./components/motion-primitives/tilt.js";
import { TransitionPanel } from "./components/motion-primitives/transition-panel.js";
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

const SAMPLE_LINK = "https://x.com/ryangrowthh/status/2116923221098573989";
const SCALE_STEPS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25] as const;

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
  const iframeObserverRef = useRef<ResizeObserver | null>(null);
  const previewSectionRef = useRef<HTMLElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [allowBrowserFallback, setAllowBrowserFallback] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pastedFeedback, setPastedFeedback] = useState(false);
  const [savedFormat, setSavedFormat] = useState<"html" | "md" | null>(null);
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
        setPastedFeedback(true);
        setTimeout(() => setPastedFeedback(false), 1600);
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

  const handleLoadSample = () => {
    setUrlInput(SAMPLE_LINK);
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
    setSavedFormat("html");
    setTimeout(() => setSavedFormat(null), 1600);
  };

  const handleExportMarkdown = () => {
    if (!activeArticle) return;
    const md = buildArticleMarkdown(activeArticle);
    const filename = buildPdfFilename(activeArticle).replace(/\.pdf$/i, ".md");
    triggerBlobDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), filename);
    setSavedFormat("md");
    setTimeout(() => setSavedFormat(null), 1600);
  };

  const handlePrintPreview = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const openPreviewTab = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  };

  const syncIframeHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const shell = doc.querySelector<HTMLElement>(".article-shell");
    const contentHeight = shell
      ? Math.max(shell.getBoundingClientRect().height + 36, doc.body.scrollHeight)
      : Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body.scrollHeight);
    if (contentHeight > 200) {
      setMobileIframeHeight(Math.ceil(contentHeight) + 24);
    }
  }, []);

  useEffect(() => {
    if (!previewHtml || isDesktop) return;
    const t1 = setTimeout(syncIframeHeight, 60);
    const t2 = setTimeout(syncIframeHeight, 220);
    const t3 = setTimeout(syncIframeHeight, 550);
    const t4 = setTimeout(syncIframeHeight, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [previewHtml, isDesktop, syncIframeHeight]);

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    const doc = iframe.contentDocument;
    if (!doc) return;

    syncIframeHeight();
    iframeObserverRef.current?.disconnect();
    if (typeof ResizeObserver !== "undefined" && doc.body) {
      const obs = new ResizeObserver(() => syncIframeHeight());
      obs.observe(doc.body);
      iframeObserverRef.current = obs;
    }

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

  const adjustFontScale = (delta: number) => {
    const next = Math.min(1.25, Math.max(0.85, Math.round((options.fontScale + delta) * 20) / 20));
    updateOption("fontScale", next);
  };

  const scalePercent = Math.round(options.fontScale * 100);
  const scaleFillPercent = ((options.fontScale - 0.85) / 0.4) * 100;
  const previewStageKey = extracting && !previewHtml ? "extracting" : previewHtml ? `preview-${activeArticle?.id ?? "doc"}` : "empty";

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen w-full flex-col bg-[var(--background)] text-[var(--foreground)] lg:h-screen lg:overflow-hidden">
        {/* Top Monochrome Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <motion.div
              whileHover={{ rotate: -5, scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              className="flex h-9 w-9 shrink-0 cursor-default items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs"
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
            </motion.div>
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
              <span className="relative flex h-2 w-2 items-center justify-center">
                {health.ready && (
                  <motion.span
                    animate={{ scale: [1, 1.9, 1], opacity: [0.55, 0, 0.55] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full bg-[var(--foreground)]"
                  />
                )}
                <span
                  className={cn(
                    "relative h-1.5 w-1.5 shrink-0 rounded-full",
                    health.ready ? "bg-[var(--foreground)]" : "bg-[var(--muted-foreground)]"
                  )}
                />
              </span>
              <span>{health.label}</span>
            </Badge>
            <Magnetic intensity={0.2}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setDarkUi((d) => !d)}
                title={darkUi ? "Switch to Paper White UI" : "Switch to Obsidian Black UI"}
                aria-label="Toggle monochrome theme"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={darkUi ? "sun" : "moon"}
                    initial={{ rotate: -55, opacity: 0, scale: 0.65 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 55, opacity: 0, scale: 0.65 }}
                    transition={{ type: "spring", stiffness: 360, damping: 24 }}
                    className="inline-flex items-center justify-center"
                  >
                    {darkUi ? <Sun /> : <Moon />}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </Magnetic>
          </div>
        </header>

        {/* Main Split Workspace */}
        <main className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[408px_1fr]">
          {/* Left Control Sidebar */}
          <aside className="flex flex-col border-b border-[var(--border)] bg-[var(--card)] lg:min-h-0 lg:border-r lg:border-b-0">
            <div className="space-y-3 p-4 lg:flex-1 lg:overflow-y-auto">
              {/* Step 1: Paste Links */}
              <Card className="overflow-hidden">
                <Spotlight />
                {extracting && <BorderTrail size={92} duration={1.9} />}
                <CardHeader>
                  <CardTitle>1. Paste X Article Link(s)</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={handlePasteClipboard}>
                      {pastedFeedback ? <Check className="text-[var(--foreground)]" /> : <ClipboardPaste />}
                      <TextMorph>{pastedFeedback ? "Pasted" : "Paste"}</TextMorph>
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
                    rows={3}
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
                    className="w-full resize-y rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--foreground)] transition-shadow placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/10 focus:outline-none"
                  />

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
                    <AnimatePresence mode="wait" initial={false}>
                      {detectedLinkCount > 0 ? (
                        <motion.span
                          key="detected"
                          initial={{ opacity: 0, scale: 0.92, y: 3 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: -3 }}
                          transition={{ type: "spring", stiffness: 420, damping: 26 }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 font-medium text-[var(--foreground)]"
                        >
                          <Check className="h-3 w-3 shrink-0" />
                          <SlidingNumber value={detectedLinkCount} className="text-[11px] font-semibold" />
                          <span>X link{detectedLinkCount > 1 ? "s" : ""} ready</span>
                        </motion.span>
                      ) : (
                        <motion.span
                          key="shortcut"
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -3 }}
                          transition={{ duration: 0.16 }}
                          className="flex items-center gap-1.5"
                        >
                          <span>Extract with</span>
                          <Kbd>Ctrl</Kbd>
                          <Kbd>Enter</Kbd>
                        </motion.span>
                      )}
                    </AnimatePresence>

                    <div
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
                    </div>
                  </div>

                  <Magnetic intensity={0.08} disabled={extracting} className="w-full">
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
                          <TextShimmer className="[--base-color:rgba(255,255,255,0.65)] [--base-gradient-color:#ffffff] dark:[--base-color:rgba(9,9,11,0.55)] dark:[--base-gradient-color:#09090b]">
                            Extracting &amp; Hydrating…
                          </TextShimmer>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Extract &amp; Format Article</span>
                        </>
                      )}
                    </RaisedButton>
                  </Magnetic>

                  <AnimatePresence>
                    {status && (
                      <motion.div
                        id="statusBanner"
                        role="status"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs leading-snug",
                          status.kind === "error"
                            ? "border-[var(--foreground)] bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                            : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                        )}
                      >
                        <span>{status.msg}</span>
                        {!isDesktop && previewHtml && status.kind === "success" && (
                          <Magnetic intensity={0.14}>
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
                          </Magnetic>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>

              {/* Step 2: Extracted Summary & Metrics */}
              <AnimatePresence>
                {activeArticle && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Card id="articlesSection" className="overflow-hidden">
                      <Spotlight />
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
                              <motion.button
                                key={doc.id}
                                type="button"
                                whileTap={{ scale: 0.99 }}
                                onClick={() => setActiveIndex(idx)}
                                className={cn(
                                  "relative w-full cursor-pointer overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors",
                                  active
                                    ? "border-[var(--foreground)] text-[var(--primary-foreground)]"
                                    : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--accent)]"
                                )}
                              >
                                {active && (
                                  <motion.div
                                    layoutId="activeArticleHighlight"
                                    transition={{ type: "spring", bounce: 0.16, duration: 0.35 }}
                                    className="absolute inset-0 bg-[var(--primary)]"
                                  />
                                )}
                                <div className="relative z-10 truncate text-xs font-semibold">{doc.title}</div>
                                <div
                                  className={cn(
                                    "relative z-10 mt-0.5 text-[11px]",
                                    active ? "opacity-80" : "text-[var(--muted-foreground)]"
                                  )}
                                >
                                  @{doc.author.handle} · {doc.diagnostics.wordCount.toLocaleString()} words
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>

                        <AnimatedGroup
                          key={activeArticle.id}
                          stagger={0.045}
                          preset="blur-slide"
                          className="grid grid-cols-2 gap-2"
                        >
                          <div
                            id="metricsGrid"
                            className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 transition-colors hover:border-[var(--foreground)]/35"
                          >
                            <div className="text-sm font-bold tracking-tight">
                              <AnimatedNumber value={activeArticle.diagnostics.wordCount} />
                            </div>
                            <div className="text-[11px] text-[var(--muted-foreground)]">
                              Words ({activeArticle.diagnostics.readingTimeMinutes} min)
                            </div>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 transition-colors hover:border-[var(--foreground)]/35">
                            <div className="text-sm font-bold tracking-tight">
                              <AnimatedNumber value={activeArticle.diagnostics.imageCount} />
                            </div>
                            <div className="text-[11px] text-[var(--muted-foreground)]">Images</div>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 transition-colors hover:border-[var(--foreground)]/35">
                            <div className="text-sm font-bold tracking-tight">
                              <AnimatedNumber value={activeArticle.diagnostics.videoLinkCount} />
                            </div>
                            <div className="text-[11px] text-[var(--muted-foreground)]">Video Links</div>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 transition-colors hover:border-[var(--foreground)]/35">
                            <div className="text-sm font-bold tracking-tight">
                              <AnimatedNumber value={activeArticle.diagnostics.embeddedPostCount} />
                            </div>
                            <div className="text-[11px] text-[var(--muted-foreground)]">
                              Posts ({activeArticle.diagnostics.embeddedPostsWithoutImagesCount} text-only)
                            </div>
                          </div>
                        </AnimatedGroup>

                        {activeArticle.diagnostics.warnings.length > 0 && (
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                            {activeArticle.diagnostics.warnings.join(" • ")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Step 3: Layout & Typography (Tactile Segmented Controls) */}
              <Disclosure title="3. Layout & Typography" defaultOpen>
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                      Typography
                    </span>
                    <div className="grid grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                      <AnimatedBackground
                        value={options.theme}
                        onValueChange={(v) => updateOption("theme", v as RenderOptions["theme"])}
                      >
                        {[
                          { id: "editorial", label: "Serif", fontCls: "font-serif" },
                          { id: "sans", label: "Sans", fontCls: "font-sans" },
                          { id: "technical", label: "Mono", fontCls: "font-mono" }
                        ].map((item) => (
                          <button
                            key={item.id}
                            data-id={item.id}
                            type="button"
                            className={cn(
                              "cursor-pointer rounded-md py-1.5 text-[11px] font-medium transition-colors",
                              item.fontCls,
                              options.theme === item.id
                                ? "text-[var(--primary-foreground)]"
                                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </AnimatedBackground>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                      Paper
                    </span>
                    <div className="grid grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                      <AnimatedBackground
                        value={options.paper}
                        onValueChange={(v) => updateOption("paper", v as RenderOptions["paper"])}
                      >
                        {[
                          { id: "light", label: "White", swatch: "bg-white border-zinc-300" },
                          { id: "ivory", label: "Ivory", swatch: "bg-[#fbf8ef] border-stone-300" },
                          { id: "dark", label: "Obsidian", swatch: "bg-zinc-950 border-zinc-600" }
                        ].map((item) => (
                          <button
                            key={item.id}
                            data-id={item.id}
                            type="button"
                            className={cn(
                              "flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-colors",
                              options.paper === item.id
                                ? "text-[var(--primary-foreground)]"
                                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            )}
                          >
                            <span className={cn("h-2.5 w-2.5 rounded-full border", item.swatch)} />
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </AnimatedBackground>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                        Page Size
                      </span>
                      <div className="grid grid-cols-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                        <AnimatedBackground
                          value={options.pageSize}
                          onValueChange={(v) => updateOption("pageSize", v as RenderOptions["pageSize"])}
                        >
                          {[
                            { id: "A4", label: "A4" },
                            { id: "Letter", label: "Letter" }
                          ].map((item) => (
                            <button
                              key={item.id}
                              data-id={item.id}
                              type="button"
                              className={cn(
                                "cursor-pointer rounded-md py-1 text-[11px] font-medium transition-colors",
                                options.pageSize === item.id
                                  ? "text-[var(--primary-foreground)]"
                                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                              )}
                            >
                              {item.label}
                            </button>
                          ))}
                        </AnimatedBackground>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                        Margins
                      </span>
                      <div className="grid grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                        <AnimatedBackground
                          value={options.margins}
                          onValueChange={(v) => updateOption("margins", v as RenderOptions["margins"])}
                        >
                          {[
                            { id: "compact", label: "Tight", title: "Compact (14mm)" },
                            { id: "balanced", label: "Std", title: "Balanced (18mm)" },
                            { id: "generous", label: "Wide", title: "Generous (22mm)" }
                          ].map((item) => (
                            <button
                              key={item.id}
                              data-id={item.id}
                              type="button"
                              title={item.title}
                              className={cn(
                                "cursor-pointer rounded-md py-1 text-[11px] font-medium transition-colors",
                                options.margins === item.id
                                  ? "text-[var(--primary-foreground)]"
                                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                              )}
                            >
                              {item.label}
                            </button>
                          ))}
                        </AnimatedBackground>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Monochrome Font Scale Control */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-[var(--muted-foreground)]">Font Scale</span>
                      <div className="flex items-center gap-0.5 font-mono font-semibold">
                        <SlidingNumber value={scalePercent} />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-md"
                        disabled={options.fontScale <= 0.85}
                        onClick={() => adjustFontScale(-0.05)}
                        aria-label="Decrease font scale"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <div className="relative flex h-7 flex-1 items-center px-1.5">
                        <div className="relative h-1.5 w-full rounded-full bg-[var(--secondary)]">
                          <motion.div
                            animate={{ width: `${scaleFillPercent}%` }}
                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                            className="h-full rounded-full bg-[var(--primary)]"
                          />
                          <motion.div
                            animate={{ left: `${scaleFillPercent}%` }}
                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--background)] bg-[var(--foreground)] shadow-sm"
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center">
                          {SCALE_STEPS.map((step) => (
                            <button
                              key={step}
                              type="button"
                              aria-label={`Set font scale ${Math.round(step * 100)}%`}
                              onClick={() => updateOption("fontScale", step)}
                              className="h-full flex-1 cursor-pointer bg-transparent"
                            />
                          ))}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-md"
                        disabled={options.fontScale >= 1.25}
                        onClick={() => adjustFontScale(0.05)}
                        aria-label="Increase font scale"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1">
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
                      <div
                        key={key}
                        onClick={() => updateOption(key, !options[key])}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--accent)]"
                      >
                        <span className="text-xs text-[var(--foreground)]">{label}</span>
                        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                          <Switch
                            checked={options[key]}
                            onCheckedChange={(checked) => updateOption(key, checked)}
                            label={label}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Disclosure>
            </div>

            {/* Sticky Bottom Export Bar */}
            <div className="space-y-2 border-t border-[var(--border)] bg-[var(--card)] p-4 lg:sticky lg:bottom-0 lg:z-10">
              <Magnetic intensity={0.08} disabled={!activeArticle || exportingPdf} className="w-full">
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
                      <TextShimmer className="[--base-color:rgba(255,255,255,0.65)] [--base-gradient-color:#ffffff] dark:[--base-color:rgba(9,9,11,0.55)] dark:[--base-gradient-color:#09090b]">
                        Rendering PDF…
                      </TextShimmer>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      <TextMorph>
                        {articles.length > 1 ? `Export All ${articles.length} PDFs (.zip)` : "Export PDF"}
                      </TextMorph>
                    </>
                  )}
                </RaisedButton>
              </Magnetic>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!activeArticle}
                  onClick={handleExportHtml}
                >
                  {savedFormat === "html" ? <Check /> : <FileCode />}
                  <TextMorph>{savedFormat === "html" ? "Saved HTML" : "HTML"}</TextMorph>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!activeArticle}
                  onClick={handleExportMarkdown}
                >
                  {savedFormat === "md" ? <Check /> : <FileText />}
                  <TextMorph>{savedFormat === "md" ? "Saved MD" : "Markdown"}</TextMorph>
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
                <TransitionPanel
                  activeKey={activeArticle ? activeArticle.id : "idle"}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <span className="block truncate">
                    {activeArticle ? activeArticle.title : "Live Print Preview"}
                  </span>
                </TransitionPanel>
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

            <div className="relative flex flex-1 flex-col lg:min-h-0">
              {extracting && previewHtml && (
                <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-[var(--border)]">
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "200%" }}
                    transition={{ repeat: Infinity, duration: 1.15, ease: "easeInOut" }}
                    className="h-full w-1/2 bg-[var(--foreground)]"
                  />
                </div>
              )}

              <TransitionPanel
                activeKey={previewStageKey}
                className="flex flex-1 flex-col lg:min-h-0"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {previewStageKey === "empty" && (
                  <div className="flex flex-1 items-center justify-center bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:20px_20px] p-5 dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] sm:p-8">
                    <Tilt rotationFactor={5} className="w-full max-w-md">
                      <Card className="w-full overflow-hidden p-7 text-center shadow-[0_18px_42px_-16px_rgba(9,9,11,0.12)] dark:shadow-[0_18px_42px_-16px_rgba(0,0,0,0.65)]">
                        <Spotlight size={260} />
                        <motion.div
                          whileHover={{ scale: 1.04 }}
                          transition={{ type: "spring", stiffness: 320, damping: 22 }}
                          className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                          aria-label="Editorial PDF geometric emblem"
                        >
                          <motion.span
                            animate={{ opacity: [0.35, 0.85, 0.35] }}
                            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                            className="pointer-events-none absolute top-2 left-2 h-2 w-2 border-t border-l border-[var(--muted-foreground)]"
                          />
                          <motion.span
                            animate={{ opacity: [0.35, 0.85, 0.35] }}
                            transition={{ repeat: Infinity, duration: 3, delay: 0.4, ease: "easeInOut" }}
                            className="pointer-events-none absolute top-2 right-2 h-2 w-2 border-t border-r border-[var(--muted-foreground)]"
                          />
                          <motion.span
                            animate={{ opacity: [0.35, 0.85, 0.35] }}
                            transition={{ repeat: Infinity, duration: 3, delay: 0.8, ease: "easeInOut" }}
                            className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l border-[var(--muted-foreground)]"
                          />
                          <motion.span
                            animate={{ opacity: [0.35, 0.85, 0.35] }}
                            transition={{ repeat: Infinity, duration: 3, delay: 1.2, ease: "easeInOut" }}
                            className="pointer-events-none absolute right-2 bottom-2 h-2 w-2 border-r border-b border-[var(--muted-foreground)]"
                          />
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
                        </motion.div>
                        <Badge variant="secondary" className="mb-3">
                          <TextShimmer duration={2.8} className="text-[11px] font-medium">
                            Monochrome Print Studio
                          </TextShimmer>
                        </Badge>
                        <TextEffect as="h2" per="word" preset="slide" className="text-lg font-bold tracking-tight">
                          Paste any X Article link to begin
                        </TextEffect>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                          Preserves headings, lists, code blocks, images, and text-only embedded posts.
                          Videos and GIFs become clickable Watch on X link cards.
                        </p>
                        <AnimatedGroup
                          stagger={0.05}
                          preset="scale"
                          className="mt-4 flex flex-wrap justify-center gap-1.5"
                        >
                          {[
                            "x.com/<user>/status/<id>",
                            "x.com/<user>/article/<id>",
                            "x.com/i/article/<id>"
                          ].map((fmt) => (
                            <code
                              key={fmt}
                              className="inline-block rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[10px] text-[var(--muted-foreground)]"
                            >
                              {fmt}
                            </code>
                          ))}
                        </AnimatedGroup>
                        <div className="mt-5 flex justify-center">
                          <Magnetic intensity={0.16}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleLoadSample}
                              className="gap-1.5 font-medium"
                            >
                              <span>Load sample X link</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Button>
                          </Magnetic>
                        </div>
                      </Card>
                    </Tilt>
                  </div>
                )}

                {previewStageKey === "extracting" && (
                  <div className="flex flex-1 items-center justify-center bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:20px_20px] p-5 dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] sm:p-8">
                    <Card className="relative w-full max-w-2xl overflow-hidden p-7 sm:p-10">
                      <BorderTrail size={110} duration={1.8} />
                      <div className="space-y-5">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <TextShimmer>
                            Fetching X payload, unrolling threads &amp; hydrating media…
                          </TextShimmer>
                        </div>
                        <div className="space-y-3">
                          <motion.div
                            animate={{ opacity: [0.45, 0.85, 0.45] }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                            className="h-7 w-4/5 rounded-md bg-[var(--secondary)]"
                          />
                          <motion.div
                            animate={{ opacity: [0.45, 0.85, 0.45] }}
                            transition={{ repeat: Infinity, duration: 1.5, delay: 0.15, ease: "easeInOut" }}
                            className="h-4 w-2/5 rounded-md bg-[var(--secondary)]"
                          />
                        </div>
                        <Separator />
                        <div className="space-y-2.5">
                          {["w-full", "w-11/12", "w-5/6", "w-full", "w-3/4"].map((widthCls, i) => (
                            <motion.div
                              key={i}
                              animate={{ opacity: [0.35, 0.75, 0.35] }}
                              transition={{
                                repeat: Infinity,
                                duration: 1.4,
                                delay: i * 0.12,
                                ease: "easeInOut"
                              }}
                              className={cn("h-3.5 rounded bg-[var(--secondary)]", widthCls)}
                            />
                          ))}
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {previewHtml && (
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
              </TransitionPanel>
            </div>
          </section>
        </main>
      </div>
    </MotionConfig>
  );
}
