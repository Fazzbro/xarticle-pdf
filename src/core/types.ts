export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  href?: string;
}

export interface AuthorProfile {
  name: string;
  handle: string;
  avatarUrl?: string;
  avatarDataUri?: string;
  verifiedType?: "blue" | "business" | "government" | null;
}

export interface ImageAsset {
  url: string;
  dataUri?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface VideoLinkAsset {
  url: string;
  directUrl?: string;
  label: string;
  isGif: boolean;
  durationText?: string;
  caption?: string;
  posterUrl?: string;
  posterDataUri?: string;
}

export interface LinkCardAsset {
  url: string;
  title: string;
  description?: string;
  domain: string;
  imageUrl?: string;
  imageDataUri?: string;
}

export interface PollOption {
  label: string;
  percentage: number;
  votes?: number;
}

export interface EmbeddedPost {
  id: string;
  url: string;
  author: AuthorProfile;
  createdAt?: string;
  text: string;
  runs: TextRun[];
  images: ImageAsset[];
  videoLinks: VideoLinkAsset[];
  quotedPost?: EmbeddedPost;
  linkCard?: LinkCardAsset;
  poll?: {
    choices: PollOption[];
    totalVotes?: number;
  };
  unavailableReason?: string;
}

export interface ListItem {
  runs: TextRun[];
  children?: {
    ordered: boolean;
    items: ListItem[];
  };
}

export type ArticleBlock =
  | { type: "paragraph"; runs: TextRun[] }
  | { type: "heading"; level: 1 | 2 | 3; id: string; runs: TextRun[] }
  | { type: "blockquote"; runs: TextRun[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "code"; language?: string; code: string }
  | { type: "divider" }
  | { type: "image"; image: ImageAsset }
  | { type: "image_grid"; images: ImageAsset[]; caption?: string }
  | { type: "video_link"; video: VideoLinkAsset }
  | { type: "embedded_post"; post: EmbeddedPost }
  | { type: "link_card"; card: LinkCardAsset };

export interface ArticleStats {
  likes?: number;
  reposts?: number;
  replies?: number;
  views?: number;
  bookmarks?: number;
}

export interface ExtractionDiagnostics {
  source: "fxtwitter" | "syndication" | "ego-browser";
  extractedAt: string;
  wordCount: number;
  readingTimeMinutes: number;
  imageCount: number;
  videoLinkCount: number;
  embeddedPostCount: number;
  embeddedPostsWithoutImagesCount: number;
  warnings: string[];
}

export interface ArticleDocument {
  id: string;
  canonicalUrl: string;
  title: string;
  subtitle?: string;
  author: AuthorProfile;
  publishedAt?: string;
  coverMedia?: ImageAsset;
  blocks: ArticleBlock[];
  stats?: ArticleStats;
  diagnostics: ExtractionDiagnostics;
}

export type ThemePreset = "editorial" | "sans" | "technical";
export type PaperPreset = "light" | "ivory" | "dark";
export type PageSizePreset = "A4" | "Letter";
export type MarginPreset = "compact" | "balanced" | "generous";

export interface RenderOptions {
  theme: ThemePreset;
  paper: PaperPreset;
  pageSize: PageSizePreset;
  margins: MarginPreset;
  fontScale: number;
  includeCover: boolean;
  includeHeader: boolean;
  includeRunningHeaderFooter: boolean;
  includeToc: boolean;
  includeVideoPoster: boolean;
  includeStats: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  theme: "editorial",
  paper: "light",
  pageSize: "A4",
  margins: "balanced",
  fontScale: 1.0,
  includeCover: true,
  includeHeader: true,
  includeRunningHeaderFooter: true,
  includeToc: false,
  includeVideoPoster: false,
  includeStats: false
};
