"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Video = {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  publishedAt: string;
  duration: string;
  views: number;
  likes: number;
  comments: number;
  categoryId?: string;
  categoryName?: string;
};

type Channel = {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  subscribers: number;
  views: number;
  videos: number;
};

type SavedChannel = {
  id: string;
  title: string;
  thumbnail?: string;
};

type HistoricalSnapshot = {
  timestamp: string;
  subscribers: number;
  views: number;
  videos: number;
};

type VideoHistoricalSnapshot = {
  timestamp: string;
  views: number;
  likes: number;
  comments: number;
};

type VideoHistory = Record<string, VideoHistoricalSnapshot[]>;

type VideoMomentumStatus =
  | "accelerating"
  | "growing"
  | "stable"
  | "slowing"
  | "collecting";

type VideoMomentum = {
  video: Video;
  snapshots: VideoHistoricalSnapshot[];
  viewsGained: number;
  likesGained: number;
  commentsGained: number;
  viewsPerDay: number;
  previousViewsPerDay: number;
  velocityChange: number | null;
  status: VideoMomentumStatus;
};

type Analytics = {
  averageViews: number;
  medianViews: number;
  averageLikes: number;
  averageComments: number;
  engagementRate: number;
  averageVideoLength: number;
  averageViewsPerDay: number;
  uploadsPerWeek: number;
  averageDaysBetweenUploads: number;
  mostCommonUploadDay: string;
  recentAverageViews: number;
  recentMedianViews: number;
  recentAverageLikes: number;
  recentAverageComments: number;
};

type Insight = { title: string; description: string };
type VideoFilter = "all" | "long" | "shorts";

type CompareDataset = {
  channel: Channel;
  videos: Video[];
  analytics: Analytics;
};

type HomeVideo = {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  publishedAt: string;
  duration: string;
  views: number;
  likes: number;
  comments: number;
  categoryId?: string;
  categoryName?: string;
  channelId: string;
  channelTitle: string;
  rank?: number;
  ageHours?: number;
  viewsPerHour?: number;
};

type HomeTopic = {
  topic?: string;
  name?: string;
  count?: number;
  mentions?: number;
  videoCount?: number;
  totalViews?: number;
  views?: number;
};

type HomeCategory = {
  categoryId?: string;
  categoryName?: string;
  name?: string;
  count?: number;
  videoCount?: number;
  totalViews?: number;
  views?: number;
};

type HomeChannel = {
  channelId?: string;
  channelTitle?: string;
  name?: string;
  videoCount?: number;
  totalViews?: number;
};

type HomeData = {
  region: string;
  trending: HomeVideo[];
  rising: HomeVideo[];
  topics: HomeTopic[];
  categories: HomeCategory[];
  channels: HomeChannel[];
  fetchedAt: string;
};

type VideoAnalysisData = {
  video: {
    id: string;
    title: string;
    description: string;
    thumbnail?: string;
    publishedAt: string;
    duration: string;
    durationSeconds: number;
    views: number;
    likes: number;
    comments: number;
    channelId: string;
    channelTitle: string;
    categoryId: string;
    definition: string;
    captionsAvailable: boolean;
    ageHours: number;
    viewsPerHour: number;
    viewsPerDay: number;
    engagementRate: number;
    likesPerThousandViews: number;
    commentsPerThousandViews: number;
    tagsCount: number;
    titleLength: number;
    descriptionLength: number;
  };
  channel: Channel | null;
  benchmark: {
    sampleSize: number;
    averageViews: number;
    medianViews: number;
    rank: number;
    totalCompared: number;
    percentile: number;
    performanceMultiple: number;
    aboveBenchmarkPercent: number;
    recentVideos: Array<{
      id: string;
      title: string;
      thumbnail?: string;
      publishedAt: string;
      views: number;
      likes: number;
      comments: number;
    }>;
  };
  fetchedAt: string;
};

const MAX_SHORT_DURATION = 60;
const MAX_VIDEO_HISTORY_SNAPSHOTS = 20;
const MAX_TRACKED_VIDEOS = 1000;

const CHART_RED = "#ff3b30";
const CHART_RED_DARK = "#dc2626";
const CHART_RED_LIGHT = "#ff6b63";
const CHART_RED_PALE = "#ff9a94";
const CHART_RED_COLORS = [
  CHART_RED,
  CHART_RED_LIGHT,
  CHART_RED_DARK,
  CHART_RED_PALE,
  "#b91c1c",
  "#ffb4af",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatCompact(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value);
}

function formatSignedCompact(value: number) {
  if (value > 0) return `+${formatCompact(value)}`;
  if (value < 0) return `-${formatCompact(Math.abs(value))}`;
  return "0";
}

function parseDuration(duration: string) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

function getVideoType(video: Video): "shorts" | "long" {
  return parseDuration(video.duration) <= MAX_SHORT_DURATION ? "shorts" : "long";
}

function getFilterLabel(filter: VideoFilter) {
  if (filter === "shorts") return "Shorts";
  if (filter === "long") return "Long-form";
  return "All Videos";
}

function filterVideos(videos: Video[], filter: VideoFilter) {
  if (filter === "shorts") return videos.filter((video) => getVideoType(video) === "shorts");
  if (filter === "long") return videos.filter((video) => getVideoType(video) === "long");
  return videos;
}

function calculateAnalytics(inputVideos: Video[]): Analytics {
  if (!inputVideos.length) {
    return {
      averageViews: 0,
      medianViews: 0,
      averageLikes: 0,
      averageComments: 0,
      engagementRate: 0,
      averageVideoLength: 0,
      averageViewsPerDay: 0,
      uploadsPerWeek: 0,
      averageDaysBetweenUploads: 0,
      mostCommonUploadDay: "N/A",
      recentAverageViews: 0,
      recentMedianViews: 0,
      recentAverageLikes: 0,
      recentAverageComments: 0,
    };
  }

  const views = inputVideos.map((video) => video.views);
  const likes = inputVideos.map((video) => video.likes);
  const comments = inputVideos.map((video) => video.comments);
  const durations = inputVideos.map((video) => parseDuration(video.duration));
  const averageViews = views.reduce((sum, value) => sum + value, 0) / views.length;
  const averageLikes = likes.reduce((sum, value) => sum + value, 0) / likes.length;
  const averageComments = comments.reduce((sum, value) => sum + value, 0) / comments.length;
  const totalEngagement = inputVideos.reduce((sum, video) => sum + video.likes + video.comments, 0);
  const totalViews = views.reduce((sum, value) => sum + value, 0);
  const engagementRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;
  const averageVideoLength = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const sortedByDate = [...inputVideos].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());

  let averageDaysBetweenUploads = 0;
  if (sortedByDate.length >= 2) {
    const differences: number[] = [];
    for (let i = 1; i < sortedByDate.length; i++) {
      const previous = new Date(sortedByDate[i - 1].publishedAt).getTime();
      const current = new Date(sortedByDate[i].publishedAt).getTime();
      const difference = (current - previous) / (1000 * 60 * 60 * 24);
      if (difference >= 0) differences.push(difference);
    }
    if (differences.length) averageDaysBetweenUploads = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  }

  const firstDate = new Date(sortedByDate[0].publishedAt).getTime();
  const lastDate = new Date(sortedByDate[sortedByDate.length - 1].publishedAt).getTime();
  const spanDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
  const uploadsPerWeek = inputVideos.length / (spanDays / 7);
  const uploadDays: Record<string, number> = {};

  for (const video of inputVideos) {
    const day = new Date(video.publishedAt).toLocaleDateString("en-US", { weekday: "long" });
    uploadDays[day] = (uploadDays[day] || 0) + 1;
  }

  const mostCommonUploadDay = Object.entries(uploadDays).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
  const recentVideos = [...inputVideos].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).slice(0, 10);
  const recentViews = recentVideos.map((video) => video.views);
  const recentLikes = recentVideos.map((video) => video.likes);
  const recentComments = recentVideos.map((video) => video.comments);

  return {
    averageViews,
    medianViews: median(views),
    averageLikes,
    averageComments,
    engagementRate,
    averageVideoLength,
    averageViewsPerDay: totalViews / spanDays,
    uploadsPerWeek,
    averageDaysBetweenUploads,
    mostCommonUploadDay,
    recentAverageViews: recentViews.reduce((sum, value) => sum + value, 0) / recentViews.length,
    recentMedianViews: median(recentViews),
    recentAverageLikes: recentLikes.reduce((sum, value) => sum + value, 0) / recentLikes.length,
    recentAverageComments: recentComments.reduce((sum, value) => sum + value, 0) / recentComments.length,
  };
}

function calculateGrowth(snapshots: HistoricalSnapshot[]) {
  if (snapshots.length < 2) return { subscriberGrowth: 0, viewGrowth: 0, videoGrowth: 0 };
  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  return {
    subscriberGrowth: latest.subscribers - first.subscribers,
    viewGrowth: latest.views - first.views,
    videoGrowth: latest.videos - first.videos,
  };
}

function calculatePreviousGrowth(snapshots: HistoricalSnapshot[]) {
  if (snapshots.length < 2) return { subscribers: 0, views: 0, videos: 0 };
  const previous = snapshots[snapshots.length - 2];
  const latest = snapshots[snapshots.length - 1];
  return {
    subscribers: latest.subscribers - previous.subscribers,
    views: latest.views - previous.views,
    videos: latest.videos - previous.videos,
  };
}

function calculateVideoVelocity(previous: VideoHistoricalSnapshot, latest: VideoHistoricalSnapshot) {
  const previousTime = new Date(previous.timestamp).getTime();
  const latestTime = new Date(latest.timestamp).getTime();
  const elapsedDays = Math.max((latestTime - previousTime) / (1000 * 60 * 60 * 24), 1 / 24);
  return (latest.views - previous.views) / elapsedDays;
}

function calculateVideoMomentum(video: Video, snapshots: VideoHistoricalSnapshot[]): VideoMomentum {
  const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (sorted.length < 2) {
    return {
      video,
      snapshots: sorted,
      viewsGained: 0,
      likesGained: 0,
      commentsGained: 0,
      viewsPerDay: 0,
      previousViewsPerDay: 0,
      velocityChange: null,
      status: "collecting",
    };
  }

  const previous = sorted[sorted.length - 2];
  const latest = sorted[sorted.length - 1];
  const viewsGained = latest.views - previous.views;
  const likesGained = latest.likes - previous.likes;
  const commentsGained = latest.comments - previous.comments;
  const viewsPerDay = calculateVideoVelocity(previous, latest);
  let previousViewsPerDay = 0;
  let velocityChange: number | null = null;

  if (sorted.length >= 3) {
    const beforePrevious = sorted[sorted.length - 3];
    previousViewsPerDay = calculateVideoVelocity(beforePrevious, previous);
    if (Math.abs(previousViewsPerDay) > 0.01) {
      velocityChange = ((viewsPerDay - previousViewsPerDay) / Math.abs(previousViewsPerDay)) * 100;
    }
  }

  let status: VideoMomentumStatus;
  if (viewsPerDay <= 0) status = "slowing";
  else if (velocityChange !== null && velocityChange >= 25) status = "accelerating";
  else if (velocityChange !== null && velocityChange <= -25) status = "slowing";
  else if (velocityChange !== null && Math.abs(velocityChange) < 10) status = "stable";
  else status = "growing";

  return {
    video,
    snapshots: sorted,
    viewsGained,
    likesGained,
    commentsGained,
    viewsPerDay,
    previousViewsPerDay,
    velocityChange,
    status,
  };
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(date: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatVideoAge(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(1)}d`;
  return `${Math.floor(days / 30)}mo`;
}

function getInsights(videos: Video[], analytics: Analytics): Insight[] {
  if (!videos.length) return [];
  const insights: Insight[] = [];
  const topVideo = [...videos].sort((a, b) => b.views - a.views)[0];
  const recentVideos = [...videos]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 5);
  const recentAverage = recentVideos.length ? recentVideos.reduce((sum, video) => sum + video.views, 0) / recentVideos.length : 0;

  if (recentAverage > analytics.averageViews * 1.2) {
    insights.push({ title: "Recent momentum", description: "The latest uploads are averaging more views than the channel's overall video average." });
  } else if (recentAverage < analytics.averageViews * 0.8) {
    insights.push({ title: "Recent slowdown", description: "The latest uploads are averaging fewer views than the channel's overall video average." });
  }
  if (analytics.engagementRate >= 5) {
    insights.push({ title: "Strong engagement", description: "Likes and comments represent a relatively high share of total views across the analyzed videos." });
  } else if (analytics.engagementRate < 1) {
    insights.push({ title: "Low interaction", description: "Likes and comments represent a relatively small share of total views." });
  }
  if (analytics.uploadsPerWeek >= 3) {
    insights.push({ title: "High upload frequency", description: `The channel averages about ${analytics.uploadsPerWeek.toFixed(1)} uploads per week in the analyzed dataset.` });
  }
  if (topVideo) {
    insights.push({ title: "Top performer", description: `"${topVideo.title}" has the highest view count in the analyzed videos with ${formatCompact(topVideo.views)} views.` });
  }
  return insights.slice(0, 4);
}

function getHomeTopicName(topic: HomeTopic) {
  return topic.topic || topic.name || "Unknown topic";
}
function getHomeTopicCount(topic: HomeTopic) {
  return topic.count ?? topic.mentions ?? topic.videoCount ?? 0;
}
function getHomeTopicViews(topic: HomeTopic) {
  return topic.totalViews ?? topic.views ?? 0;
}
function getHomeCategoryName(category: HomeCategory) {
  return category.categoryName || category.name || "Other";
}
function getHomeCategoryCount(category: HomeCategory) {
  return category.videoCount ?? category.count ?? 0;
}
function getHomeCategoryViews(category: HomeCategory) {
  return category.totalViews ?? category.views ?? 0;
}
function getHomeChannelName(channel: HomeChannel) {
  return channel.channelTitle || channel.name || "Unknown channel";
}
function getHomeChannelViews(channel: HomeChannel) {
  return channel.totalViews ?? 0;
}


type IconName =
  | "home"
  | "dashboard"
  | "video"
  | "insights"
  | "channels"
  | "compare"
  | "settings";

function AppIcon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="M3 10.5 10 4l7 6.5" />
        <path d="M5 9.5V16h10V9.5" />
        <path d="M8.5 16v-4h3v4" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="5" height="5" rx="1" />
        <rect x="10" y="3" width="5" height="5" rx="1" />
        <rect x="3" y="10" width="5" height="5" rx="1" />
        <rect x="10" y="10" width="5" height="5" rx="1" />
      </>
    ),
    video: (
      <>
        <rect x="2.5" y="4" width="11" height="10" rx="2" />
        <path d="m14 7 2.5-1.5v7L14 11" />
        <path d="m7.5 7.2 3.2 1.8-3.2 1.8Z" />
      </>
    ),
    insights: (
      <>
        <path d="M3 14.5 7 10l3 2.5 5-6" />
        <path d="M13 6.5h2v2" />
        <path d="M3 16h13" />
      </>
    ),
    channels: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3.5 16c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
        <path d="M14 4.5h2.5" />
        <path d="M15.25 3.25v2.5" />
      </>
    ),
    compare: (
      <>
        <path d="M5 5h8" />
        <path d="M11 2.5 13.5 5 11 7.5" />
        <path d="M13 13H5" />
        <path d="M7 10.5 4.5 13 7 15.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="9" cy="9" r="2.5" />
        <path d="M9 2.5v2" />
        <path d="M9 13.5v2" />
        <path d="M2.5 9h2" />
        <path d="M13.5 9h2" />
        <path d="m4.4 4.4 1.4 1.4" />
        <path d="m12.2 12.2 1.4 1.4" />
        <path d="m13.6 4.4-1.4 1.4" />
        <path d="m5.8 12.2-1.4 1.4" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-300 ${
        active
          ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_8px_30px_rgba(0,0,0,0.16)]"
          : "text-white/45 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 ${
          active
            ? "bg-red-500/15 text-red-300"
            : "bg-white/[0.03] text-white/35 group-hover:bg-white/[0.07] group-hover:text-white/80"
        }`}
      >
        <AppIcon name={icon} size={15} />
      </span>

      <span className="relative z-10 flex-1">
        {label}
      </span>

      {active && (
        <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.9)]" />
      )}

      <span className="absolute inset-y-0 left-0 w-24 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent transition-transform duration-700 group-hover:translate-x-[310%]" />
    </button>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border px-3.5 py-2 text-xs font-medium transition-all duration-300 ${
        active
          ? "border-white/20 bg-white text-black shadow-[0_8px_30px_rgba(255,255,255,0.08)]"
          : "border-white/5 bg-white/[0.035] text-white/50 hover:-translate-y-px hover:border-white/10 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <span className="relative z-10">{children}</span>
      <span className="absolute inset-y-0 left-0 w-12 -translate-x-[180%] bg-white/20 blur-md transition-transform duration-500 group-hover:translate-x-[520%]" />
    </button>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="glass-card group relative overflow-hidden glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-red-500/10 blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:bg-red-500/15" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">
            {label}
          </p>
          <span className="h-2 w-2 rounded-full bg-white/15 transition-all duration-300 group-hover:bg-red-400 group-hover:shadow-[0_0_12px_rgba(248,113,113,0.8)]" />
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white transition-transform duration-300 group-hover:translate-x-0.5">
          {value}
        </p>
        {description && (
          <p className="mt-2 text-xs leading-5 text-white/30">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="glass-card group glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-white/35">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold tracking-tight text-white transition-transform duration-300 group-hover:translate-x-0.5">
        {value}
      </p>
      {description && (
        <p className="mt-2 text-xs leading-5 text-white/30">
          {description}
        </p>
      )}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="group flex items-center justify-between border-b border-white/5 py-3 transition-colors duration-200 last:border-0 hover:border-white/10">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.45)]" />
        <h2 className="text-base font-semibold tracking-tight text-white">
          {title}
        </h2>
      </div>
      {description && (
        <p className="mt-1.5 pl-3 text-xs leading-5 text-white/30">
          {description}
        </p>
      )}
    </div>
  );
}

function EmptyPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white/50">○</div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/40">{description}</p>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center">
      <p className="text-sm text-white/30">{text}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#151515] px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-white/40">{label}</p>
      {payload.map((entry: any) => (
        <p key={String(entry.dataKey)} className="text-xs text-white">
          {entry.name || entry.dataKey}: {typeof entry.value === "number" ? formatCompact(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

function VideoRow({ video, rank }: { video: Video; rank?: number }) {
  return (
    <div className="group flex items-center gap-4 border-b border-white/5 py-3 transition-all duration-300 last:border-0 hover:bg-white/[0.015]">
      {rank !== undefined && <div className="w-6 text-center text-xs text-white/30">{rank}</div>}
      {video.thumbnail ? <img src={video.thumbnail} alt="" className="h-12 w-20 rounded-lg object-cover" /> : <div className="h-12 w-20 rounded-lg bg-white/5" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{video.title}</p>
        <p className="mt-1 text-xs text-white/30">{formatDate(video.publishedAt)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-white">{formatCompact(video.views)}</p>
        <p className="text-xs text-white/30">views</p>
      </div>
    </div>
  );
}

function MomentumStatus({ status }: { status: VideoMomentumStatus }) {
  const config: Record<VideoMomentumStatus, { label: string; className: string }> = {
    accelerating: { label: "Accelerating", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
    growing: { label: "Growing", className: "border-blue-400/20 bg-blue-400/10 text-blue-300" },
    stable: { label: "Stable", className: "border-white/10 bg-white/5 text-white/50" },
    slowing: { label: "Slowing", className: "border-red-400/20 bg-red-400/10 text-red-300" },
    collecting: { label: "Collecting data", className: "border-yellow-400/20 bg-yellow-400/10 text-yellow-300" },
  };
  const current = config[status];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${current.className}`}>{current.label}</span>;
}

function MomentumRow({ momentum, rank }: { momentum: VideoMomentum; rank: number }) {
  return (
    <div className="border-b border-white/5 py-4 last:border-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="w-5 text-center text-xs text-white/25">{rank}</div>
          {momentum.video.thumbnail ? <img src={momentum.video.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover" /> : <div className="h-14 w-24 rounded-lg bg-white/5" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{momentum.video.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/30">
              <span>{formatCompact(momentum.video.views)} current views</span><span>·</span><span>{formatDate(momentum.video.publishedAt)}</span><span>·</span><span>{momentum.snapshots.length} snapshots</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[620px]">
          <div><p className="text-[10px] text-white/30">Views gained</p><p className="mt-1 text-sm font-medium text-white">{formatSignedCompact(momentum.viewsGained)}</p></div>
          <div><p className="text-[10px] text-white/30">Views / day</p><p className="mt-1 text-sm font-medium text-white">{formatCompact(Math.max(0, momentum.viewsPerDay))}</p></div>
          <div><p className="text-[10px] text-white/30">Velocity</p><p className="mt-1 text-sm font-medium text-white">{momentum.velocityChange === null ? "—" : `${momentum.velocityChange >= 0 ? "+" : ""}${momentum.velocityChange.toFixed(0)}%`}</p></div>
          <div className="flex items-end sm:items-center"><MomentumStatus status={momentum.status} /></div>
        </div>
      </div>
    </div>
  );
}

function HomeVideoRow({ video, rank, rising = false }: { video: HomeVideo; rank?: number; rising?: boolean }) {
  return (
    <div className="group -mx-2 flex gap-3 rounded-2xl border-b border-white/5 px-2 py-3.5 transition-all duration-300 last:border-0 hover:-translate-y-px hover:bg-white/[0.035]">
      {rank !== undefined && <div className="flex w-5 shrink-0 items-center justify-center text-xs text-white/25">{rank}</div>}
      {video.thumbnail ? <div className="thumbnail-frame h-16 w-28 shrink-0"><img src={video.thumbnail} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" /></div> : <div className="thumbnail-frame h-16 w-28 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-5 text-white">{video.title}</p>
        <p className="mt-1 truncate text-xs text-white/35">{video.channelTitle}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/30">
          <span>{formatCompact(video.views)} views</span>
          {video.categoryName && <><span>·</span><span>{video.categoryName}</span></>}
          <span>·</span><span>{formatRelativeTime(video.publishedAt)}</span>
        </div>
      </div>
      {rising && <div className="hidden shrink-0 text-right sm:block"><p className="text-sm font-semibold text-emerald-300">{formatCompact(Math.max(0, video.viewsPerHour || 0))}</p><p className="text-[10px] text-white/30">views / hour</p></div>}
    </div>
  );
}

function HomeLoadingRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex animate-pulse gap-3 border-b border-white/5 py-3 last:border-0">
          <div className="h-16 w-28 rounded-lg bg-white/5" />
          <div className="min-w-0 flex-1"><div className="h-3 w-4/5 rounded bg-white/5" /><div className="mt-2 h-3 w-2/5 rounded bg-white/5" /><div className="mt-3 h-2 w-3/5 rounded bg-white/5" /></div>
        </div>
      ))}
    </div>
  );
}

function HomeSignalCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="signal-card group rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/32">{label}</p>
          <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-white">{value}</p>
          <p className="mt-1 text-[11px] leading-5 text-white/28">{detail}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/55 transition-all duration-300 group-hover:scale-110 group-hover:border-red-400/25 group-hover:bg-red-500/10 group-hover:text-red-300">
          {icon}
        </div>
      </div>
      <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-red-500/10 blur-2xl transition-transform duration-500 group-hover:scale-150" />
    </div>
  );
}

function HomeChannelRow({ channel, rank }: { channel: HomeChannel; rank: number }) {
  const title = getHomeChannelName(channel);
  return (
    <div className="group -mx-2 flex items-center gap-3 rounded-2xl border-b border-white/5 px-2 py-3 transition-all duration-300 last:border-0 hover:-translate-y-px hover:bg-white/[0.03]">
      <div className="w-5 text-center text-xs text-white/25">{rank}</div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-white/[0.09] to-white/[0.02] text-xs font-semibold text-white/55 transition-transform duration-300 group-hover:scale-105">{title.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{title}</p><p className="mt-1 text-[10px] text-white/30">{channel.videoCount || 0} trending video{channel.videoCount === 1 ? "" : "s"}</p></div>
      <div className="text-right"><p className="text-sm font-medium text-white">{formatCompact(getHomeChannelViews(channel))}</p><p className="text-[10px] text-white/30">views</p></div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [savedChannels, setSavedChannels] = useState<SavedChannel[]>([]);
  const [history, setHistory] = useState<Record<string, HistoricalSnapshot[]>>({});
  const [videoHistory, setVideoHistory] = useState<VideoHistory>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState<"home" | "dashboard" | "video" | "insights" | "channels" | "compare" | "settings">("home");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [videoFilter, setVideoFilter] = useState<VideoFilter>("all");
  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<CompareDataset[]>([]);
  const [compareFilter, setCompareFilter] = useState<VideoFilter>("all");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState("");
  const [homeRegion, setHomeRegion] = useState("PH");
  const [videoInput, setVideoInput] = useState("");
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisData | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("youtubeSavedChannels");
      if (saved) setSavedChannels(JSON.parse(saved));
      const savedHistory = localStorage.getItem("youtubeChannelHistory");
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      const savedVideoHistory = localStorage.getItem("youtubeVideoHistory");
      if (savedVideoHistory) setVideoHistory(JSON.parse(savedVideoHistory));
    } catch {
      setSavedChannels([]);
      setHistory({});
      setVideoHistory({});
    }
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try { localStorage.setItem("youtubeSavedChannels", JSON.stringify(savedChannels)); } catch {}
  }, [savedChannels, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    try { localStorage.setItem("youtubeChannelHistory", JSON.stringify(history)); } catch {}
  }, [history, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    try { localStorage.setItem("youtubeVideoHistory", JSON.stringify(videoHistory)); } catch {}
  }, [videoHistory, storageLoaded]);

  async function fetchHomeData(region = homeRegion) {
    setHomeLoading(true);
    setHomeError("");
    try {
      const response = await fetch(`/api/youtube?action=home&region=${encodeURIComponent(region)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load YouTube intelligence.");
      setHomeData(data);
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : "Failed to load YouTube intelligence.");
    } finally {
      setHomeLoading(false);
    }
  }

  useEffect(() => {
    fetchHomeData("PH");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyzeVideo(input: string) {
    const trimmed = input.trim();

    if (!trimmed) {
      setVideoError("Paste a YouTube video URL or video ID.");
      return;
    }

    setVideoLoading(true);
    setVideoError("");

    try {
      const response = await fetch(`/api/video?url=${encodeURIComponent(trimmed)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze video.");
      }

      setVideoAnalysis(data);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Failed to analyze video.");
      setVideoAnalysis(null);
    } finally {
      setVideoLoading(false);
    }
  }

  async function analyzeChannel(inputUrl: string) {
    const trimmedUrl = inputUrl.trim();
    if (!trimmedUrl) {
      setError("Enter a YouTube channel URL or handle.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let endpoint = "";
      const handleMatch = trimmedUrl.match(/@([^/?#]+)/);
      const channelMatch = trimmedUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
      if (channelMatch) endpoint = `/api/youtube?id=${encodeURIComponent(channelMatch[1])}`;
      else if (handleMatch) endpoint = `/api/youtube?handle=${encodeURIComponent(handleMatch[1])}`;
      else if (/^UC[a-zA-Z0-9_-]{20,}$/.test(trimmedUrl)) endpoint = `/api/youtube?id=${encodeURIComponent(trimmedUrl)}`;
      else if (trimmedUrl.startsWith("@")) endpoint = `/api/youtube?handle=${encodeURIComponent(trimmedUrl.slice(1))}`;
      else endpoint = `/api/youtube?handle=${encodeURIComponent(trimmedUrl)}`;

      const response = await fetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to analyze channel.");

      const analyzedVideos: Video[] = data.videos || [];
      setChannel(data.channel);
      setVideos(analyzedVideos);
      setUrl(`https://youtube.com/channel/${data.channel.id}`);
      setVideoFilter("all");
      setActivePage("dashboard");

      const timestamp = new Date().toISOString();
      const snapshot: HistoricalSnapshot = {
        timestamp,
        subscribers: data.channel.subscribers,
        views: data.channel.views,
        videos: data.channel.videos,
      };

      setHistory((previous) => {
        const existing = previous[data.channel.id] || [];
        const latest = existing[existing.length - 1];
        if (latest && Math.abs(new Date(timestamp).getTime() - new Date(latest.timestamp).getTime()) < 60 * 1000) return previous;
        return { ...previous, [data.channel.id]: [...existing, snapshot].slice(-100) };
      });

      setVideoHistory((previous) => {
        const next: VideoHistory = { ...previous };
        for (const video of analyzedVideos) {
          const existing = next[video.id] || [];
          const latest = existing[existing.length - 1];
          if (latest && Math.abs(new Date(timestamp).getTime() - new Date(latest.timestamp).getTime()) < 60 * 1000) continue;
          next[video.id] = [...existing, { timestamp, views: video.views, likes: video.likes, comments: video.comments }].slice(-MAX_VIDEO_HISTORY_SNAPSHOTS);
        }
        const entries = Object.entries(next);
        if (entries.length > MAX_TRACKED_VIDEOS) {
          entries.sort((a, b) => new Date(b[1][b[1].length - 1]?.timestamp || 0).getTime() - new Date(a[1][a[1].length - 1]?.timestamp || 0).getTime());
          return Object.fromEntries(entries.slice(0, MAX_TRACKED_VIDEOS));
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function saveCurrentChannel() {
    if (!channel || savedChannels.some((saved) => saved.id === channel.id)) return;
    setSavedChannels((previous) => [...previous, { id: channel.id, title: channel.title, thumbnail: channel.thumbnail }]);
  }

  function removeSavedChannel(id: string) {
    setSavedChannels((previous) => previous.filter((item) => item.id !== id));
    setCompareSelected((previous) => previous.filter((item) => item !== id));
  }

  function isChannelSaved() {
    return channel ? savedChannels.some((saved) => saved.id === channel.id) : false;
  }

  const filteredVideos = useMemo(() => filterVideos(videos, videoFilter), [videos, videoFilter]);
  const analytics = useMemo(() => calculateAnalytics(filteredVideos), [filteredVideos]);
  const allAnalytics = useMemo(() => calculateAnalytics(videos), [videos]);
  const topVideos = useMemo(() => [...filteredVideos].sort((a, b) => b.views - a.views).slice(0, 10), [filteredVideos]);
  const recentVideos = useMemo(() => [...filteredVideos].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).slice(0, 10), [filteredVideos]);
  const insights = useMemo(() => getInsights(filteredVideos, analytics), [filteredVideos, analytics]);

  const videoMomentum = useMemo(() => filteredVideos.map((video) => calculateVideoMomentum(video, videoHistory[video.id] || []))
    .sort((a, b) => {
      if (a.status === "collecting" && b.status !== "collecting") return 1;
      if (a.status !== "collecting" && b.status === "collecting") return -1;
      return b.viewsPerDay - a.viewsPerDay;
    }).slice(0, 15), [filteredVideos, videoHistory]);
  const trackedMomentumVideos = useMemo(() => videoMomentum.filter((item) => item.snapshots.length >= 2), [videoMomentum]);
  const acceleratingVideos = useMemo(() => videoMomentum.filter((item) => item.status === "accelerating"), [videoMomentum]);
  const fastestGrowingVideo = useMemo(() => [...trackedMomentumVideos].sort((a, b) => b.viewsPerDay - a.viewsPerDay)[0] || null, [trackedMomentumVideos]);

  const viewsChartData = useMemo(() => [...filteredVideos].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()).slice(-20).map((video) => ({ date: new Date(video.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }), views: video.views })), [filteredVideos]);
  const uploadDayData = useMemo(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const counts = days.map((day) => ({ day, uploads: 0 }));
    filteredVideos.forEach((video) => counts[new Date(video.publishedAt).getDay()].uploads++);
    return counts;
  }, [filteredVideos]);
  const durationData = useMemo(() => {
    const buckets = [
      { name: "< 1m", min: 0, max: 60, count: 0 },
      { name: "1–5m", min: 60, max: 300, count: 0 },
      { name: "5–10m", min: 300, max: 600, count: 0 },
      { name: "10–20m", min: 600, max: 1200, count: 0 },
      { name: "20m+", min: 1200, max: Infinity, count: 0 },
    ];
    filteredVideos.forEach((video) => {
      const seconds = parseDuration(video.duration);
      const bucket = buckets.find((item) => seconds >= item.min && seconds < item.max);
      if (bucket) bucket.count++;
    });
    return buckets;
  }, [filteredVideos]);
  const engagementData = useMemo(() => [
    { name: "Likes", value: filteredVideos.reduce((sum, video) => sum + video.likes, 0) },
    { name: "Comments", value: filteredVideos.reduce((sum, video) => sum + video.comments, 0) },
  ], [filteredVideos]);

  const contentCategoryData = useMemo(() => {
    if (!filteredVideos.length) return [];

    const groups = new Map<string, Video[]>();

    for (const video of filteredVideos) {
      const key = video.categoryName || "Uncategorized";
      const existing = groups.get(key) || [];
      existing.push(video);
      groups.set(key, existing);
    }

    return Array.from(groups.entries())
      .map(([name, group]) => {
        const stats = calculateAnalytics(group);
        return {
          name,
          videos: group.length,
          averageViews: stats.averageViews,
          medianViews: stats.medianViews,
          engagement: stats.engagementRate,
        };
      })
      .sort((a, b) => b.medianViews - a.medianViews);
  }, [filteredVideos]);

  const strongestCategory = contentCategoryData[0] || null;

  const performanceMatrixData = useMemo(() => {
    if (!filteredVideos.length) return [];

    const maxViews = Math.max(...filteredVideos.map((video) => video.views), 1);
    const maxEngagement = Math.max(
      ...filteredVideos.map((video) =>
        video.views > 0
          ? ((video.likes + video.comments) / video.views) * 100
          : 0
      ),
      0.01
    );

    return filteredVideos.slice(0, 100).map((video) => {
      const engagement =
        video.views > 0
          ? ((video.likes + video.comments) / video.views) * 100
          : 0;

      return {
        id: video.id,
        title: video.title,
        x: Math.max(4, Math.min(96, (engagement / maxEngagement) * 92 + 4)),
        y: Math.max(6, Math.min(94, 96 - (video.views / maxViews) * 88)),
        views: video.views,
        engagement,
      };
    });
  }, [filteredVideos]);

  const performanceOutliers = useMemo(() => {
    const baseline = Math.max(allAnalytics.medianViews, 1);

    return [...filteredVideos]
      .map((video) => ({
        ...video,
        multiple: video.views / baseline,
      }))
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 6);
  }, [filteredVideos, allAnalytics.medianViews]);

  const insightCards = useMemo(() => {
    const cards: Insight[] = [...insights];

    if (strongestCategory) {
      cards.push({
        title: "Strongest content area",
        description: `${strongestCategory.name} has the highest median views in the current analyzed dataset at ${formatCompact(strongestCategory.medianViews)}.`,
      });
    }

    if (analytics.recentMedianViews > 0 && analytics.medianViews > 0) {
      const change =
        ((analytics.recentMedianViews - analytics.medianViews) /
          analytics.medianViews) *
        100;

      if (Math.abs(change) >= 10) {
        cards.push({
          title: change > 0 ? "Recent content is elevated" : "Recent content is softer",
          description: `The latest 10 videos are ${Math.abs(change).toFixed(0)}% ${change > 0 ? "above" : "below"} the selected dataset median by views.`,
        });
      }
    }

    return cards.slice(0, 6);
  }, [insights, strongestCategory, analytics]);

  function exportChannelReport() {
    if (!channel || !videos.length) return;

    const report = {
      generatedAt: new Date().toISOString(),
      channel: {
        id: channel.id,
        title: channel.title,
        subscribers: channel.subscribers,
        totalViews: channel.views,
        totalVideos: channel.videos,
      },
      filter: getFilterLabel(videoFilter),
      analytics,
      strongestCategory,
      topVideos: topVideos.map((video) => ({
        id: video.id,
        title: video.title,
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        publishedAt: video.publishedAt,
        category: video.categoryName || "Uncategorized",
      })),
      insights: insightCards,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${channel.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "youtube-report"}-report.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const channelHistory = channel ? history[channel.id] || [] : [];
  const growth = calculateGrowth(channelHistory);
  const previousGrowth = calculatePreviousGrowth(channelHistory);
  const growthChartData = channelHistory.map((snapshot) => ({
    date: new Date(snapshot.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    subscribers: snapshot.subscribers,
  }));

  async function loadComparison() {
    if (compareSelected.length !== 2) {
      setCompareError("Select exactly two channels.");
      return;
    }
    setCompareLoading(true);
    setCompareError("");
    try {
      const results = await Promise.all(compareSelected.map(async (id) => {
        const response = await fetch(`/api/youtube?id=${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load comparison data.");
        return { channel: data.channel, videos: data.videos || [], analytics: calculateAnalytics(data.videos || []) };
      }));
      setCompareData(results);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Failed to compare channels.");
    } finally {
      setCompareLoading(false);
    }
  }

  const compareFiltered = compareData.map((dataset) => ({ ...dataset, videos: filterVideos(dataset.videos, compareFilter) }));

  const homeCategoryChartData = useMemo(() => !homeData ? [] : homeData.categories.slice(0, 8).map((category) => ({ name: getHomeCategoryName(category), videos: getHomeCategoryCount(category), views: getHomeCategoryViews(category) })), [homeData]);
  const homeCategoryPieData = useMemo(() => !homeData ? [] : homeData.categories.slice(0, 6).map((category) => ({ name: getHomeCategoryName(category), value: getHomeCategoryCount(category) })), [homeData]);
  const homeTrendingChartData = useMemo(() => !homeData ? [] : homeData.trending.slice(0, 10).map((video) => ({ name: video.title.length > 28 ? `${video.title.slice(0, 28)}…` : video.title, views: video.views, channel: video.channelTitle })), [homeData]);
  const homeRisingChartData = useMemo(() => !homeData ? [] : homeData.rising.slice(0, 10).map((video) => ({ name: video.title.length > 28 ? `${video.title.slice(0, 28)}…` : video.title, viewsPerHour: Math.max(0, video.viewsPerHour || 0), views: video.views })), [homeData]);
  const homeTopicChartData = useMemo(() => !homeData ? [] : homeData.topics.slice(0, 10).map((topic) => ({ name: getHomeTopicName(topic), mentions: getHomeTopicCount(topic), views: getHomeTopicViews(topic) })), [homeData]);
  const homeChannelChartData = useMemo(() => !homeData ? [] : homeData.channels.slice(0, 10).map((channelItem) => ({ name: getHomeChannelName(channelItem).length > 22 ? `${getHomeChannelName(channelItem).slice(0, 22)}…` : getHomeChannelName(channelItem), views: getHomeChannelViews(channelItem) })), [homeData]);
  const homeCategoryPerformanceData = useMemo(() => {
    if (!homeData) return [];
    const categoryMap = new Map<string, { views: number; likes: number; comments: number; videos: number }>();
    for (const video of homeData.trending) {
      const category = video.categoryName || "Other";
      const current = categoryMap.get(category) || { views: 0, likes: 0, comments: 0, videos: 0 };
      current.views += video.views || 0;
      current.likes += video.likes || 0;
      current.comments += video.comments || 0;
      current.videos += 1;
      categoryMap.set(category, current);
    }
    return Array.from(categoryMap.entries()).map(([name, data]) => ({ name, views: data.views, videos: data.videos, engagement: data.views > 0 ? ((data.likes + data.comments) / data.views) * 100 : 0 })).sort((a, b) => b.views - a.views).slice(0, 8);
  }, [homeData]);

  const homeSnapshot = useMemo(() => {
    if (!homeData) {
      return {
        totalViews: 0,
        topVideo: null as HomeVideo | null,
        topRising: null as HomeVideo | null,
        topTopic: null as HomeTopic | null,
        topChannel: null as HomeChannel | null,
      };
    }

    return {
      totalViews: homeData.trending.reduce((sum, video) => sum + (video.views || 0), 0),
      topVideo: homeData.trending[0] || null,
      topRising: homeData.rising[0] || null,
      topTopic: homeData.topics[0] || null,
      topChannel: homeData.channels[0] || null,
    };
  }, [homeData]);

  return (
    <div className="aurora-shell min-h-screen overflow-x-hidden bg-[#090a0d] text-white">
      <style jsx global>{`
        @keyframes auroraDriftA {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(4%, 2%, 0) scale(1.08); }
        }
        @keyframes auroraDriftB {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-5%, 3%, 0) scale(1.12); }
        }
        @keyframes fadeRise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes softPulse {
          0%, 100% { opacity: .35; transform: scale(1); }
          50% { opacity: .8; transform: scale(1.08); }
        }
        @keyframes borderGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
          50% { box-shadow: 0 0 32px rgba(239, 68, 68, .045); }
        }
        .aurora-shell {
          position: relative;
          isolation: isolate;
        }
        .aurora-shell::before,
        .aurora-shell::after {
          content: "";
          position: fixed;
          pointer-events: none;
          z-index: -1;
          border-radius: 9999px;
          filter: blur(70px);
          opacity: .5;
        }
        .aurora-shell::before {
          width: 460px;
          height: 460px;
          top: -180px;
          right: -120px;
          background: radial-gradient(circle, rgba(239,68,68,.14), transparent 68%);
          animation: auroraDriftA 14s ease-in-out infinite;
        }
        .aurora-shell::after {
          width: 520px;
          height: 520px;
          bottom: -260px;
          left: -170px;
          background: radial-gradient(circle, rgba(59,130,246,.08), transparent 68%);
          animation: auroraDriftB 18s ease-in-out infinite;
        }
        .glass-card {
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 10px 40px rgba(0,0,0,.14);
          transition: transform .3s ease, border-color .3s ease, background-color .3s ease, box-shadow .3s ease;
        }
        .glass-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255,255,255,.16);
          background-color: rgba(255,255,255,.05);
          box-shadow: 0 20px 55px rgba(0,0,0,.24), 0 0 0 1px rgba(255,255,255,.025);
        }
        .premium-card {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018));
          border: 1px solid rgba(255,255,255,.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 18px 55px rgba(0,0,0,.18);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .premium-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 0% 0%, rgba(239,68,68,.12), transparent 35%), radial-gradient(circle at 100% 100%, rgba(59,130,246,.07), transparent 32%);
          opacity: .8;
        }
        .premium-card::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .18;
          background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 26px 26px;
          mask-image: linear-gradient(to bottom, black, transparent 68%);
          -webkit-mask-image: linear-gradient(to bottom, black, transparent 68%);
        }
        .hero-glow {
          position: absolute;
          border-radius: 9999px;
          filter: blur(18px);
          pointer-events: none;
        }
        .signal-card {
          position: relative;
          overflow: hidden;
          transition: transform .35s cubic-bezier(.22,1,.36,1), border-color .35s ease, background-color .35s ease, box-shadow .35s ease;
        }
        .signal-card:hover {
          transform: translateY(-5px) scale(1.01);
          border-color: rgba(255,255,255,.16);
          box-shadow: 0 18px 44px rgba(0,0,0,.22);
        }
        .signal-card::after {
          content: "";
          position: absolute;
          left: 16px;
          right: 16px;
          bottom: 0;
          height: 2px;
          border-radius: 9999px;
          background: linear-gradient(90deg, transparent, rgba(239,68,68,.6), transparent);
          opacity: .7;
        }
        .shine-slow {
          position: relative;
          overflow: hidden;
        }
        .shine-slow::after {
          content: "";
          position: absolute;
          inset: -30% -60%;
          background: linear-gradient(100deg, transparent 43%, rgba(255,255,255,.065) 50%, transparent 57%);
          transform: translateX(-55%);
          animation: heroShimmer 7s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes heroShimmer {
          0%, 65% { transform: translateX(-55%); }
          80%, 100% { transform: translateX(55%); }
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee 26s linear infinite;
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .topic-chip {
          transition: transform .25s ease, background-color .25s ease, border-color .25s ease;
        }
        .topic-chip:hover {
          transform: translateY(-2px);
          background-color: rgba(255,255,255,.07);
          border-color: rgba(255,255,255,.13);
        }
        .thumbnail-frame {
          position: relative;
          overflow: hidden;
          border-radius: 14px;
          background: rgba(255,255,255,.04);
        }
        .thumbnail-frame::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,.38), transparent 55%);
          pointer-events: none;
        }
        .page-transition {
          animation: fadeRise .45s cubic-bezier(.22,1,.36,1) both;
        }
        .button-sheen {
          position: relative;
          overflow: hidden;
        }
        .button-sheen::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-120%);
          background: linear-gradient(110deg, transparent 25%, rgba(255,255,255,.5), transparent 75%);
          transition: transform .65s ease;
        }
        .button-sheen:hover::after {
          transform: translateX(120%);
        }
        .brand-mark {
          position: relative;
          animation: borderGlow 4s ease-in-out infinite;
        }
        .brand-mark::after {
          content: "";
          position: absolute;
          inset: -5px;
          border-radius: inherit;
          background: rgba(239,68,68,.13);
          filter: blur(11px);
          z-index: -1;
        }
        .chart-card {
          border-color: rgba(255,255,255,.09);
          box-shadow: 0 14px 46px rgba(0,0,0,.16);
        }
        .chart-card::before {
          content: "";
          position: absolute;
          left: 18px;
          right: 18px;
          top: 0;
          height: 2px;
          border-radius: 9999px;
          background: linear-gradient(90deg, transparent, rgba(255,59,48,.9), rgba(255,107,99,.55), transparent);
          opacity: .72;
        }
        .chart-card:hover {
          border-color: rgba(255,255,255,.15);
          box-shadow: 0 20px 58px rgba(0,0,0,.24), 0 0 34px rgba(255,59,48,.045);
        }
        .recharts-surface {
          overflow: visible;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] border-r border-white/10 bg-black/20 backdrop-blur-2xl lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-sm font-bold shadow-[0_8px_30px_rgba(220,38,38,0.22)]">Y</div>
              <div><p className="text-sm font-semibold">YouTube Analyzer</p><p className="text-[10px] text-white/30">Channel intelligence</p></div>
            </div>
          </div>
          <nav className="space-y-1 px-3 py-4">
            <NavItem label="Home" icon="home" active={activePage === "home"} onClick={() => setActivePage("home")} />
            <NavItem label="Dashboard" icon="dashboard" active={activePage === "dashboard"} onClick={() => setActivePage("dashboard")} />
            <NavItem label="Video Analyzer" icon="video" active={activePage === "video"} onClick={() => setActivePage("video")} />
            <NavItem label="Insights" icon="insights" active={activePage === "insights"} onClick={() => setActivePage("insights")} />
            <NavItem label="Channels" icon="channels" active={activePage === "channels"} onClick={() => setActivePage("channels")} />
            <NavItem label="Compare" icon="compare" active={activePage === "compare"} onClick={() => setActivePage("compare")} />
            <NavItem label="Settings" icon="settings" active={activePage === "settings"} onClick={() => setActivePage("settings")} />
          </nav>
          <div className="flex-1 overflow-y-auto px-3">
            {savedChannels.length > 0 && <>
              <div className="flex items-center justify-between px-3 pb-2 pt-5">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/20">Saved channels</div>
                <span className="rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/30">{savedChannels.length}</span>
              </div>
              <div className="space-y-1">
                {savedChannels.map((saved) => (
                  <button key={saved.id} onClick={() => { setUrl(`https://youtube.com/channel/${saved.id}`); analyzeChannel(saved.id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/50 hover:bg-white/5 hover:text-white">
                    {saved.thumbnail ? <img src={saved.thumbnail} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="h-6 w-6 rounded-full bg-white/10" />}
                    <span className="truncate">{saved.title}</span>
                  </button>
                ))}
              </div>
            </>}
          </div>
          <div className="border-t border-white/10 px-4 py-4">
            <p className="text-[10px] leading-4 text-white/20">
              Data provided by the YouTube Data API v3.
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-white/20">
              Developed by
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-white/55">
              Clart Kent Nailgas
            </p>
          </div>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#090a0d]/85 px-3 py-2 backdrop-blur-2xl lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mr-1 flex shrink-0 items-center gap-2 rounded-xl bg-red-500/10 px-2.5 py-2 text-xs font-semibold text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-600 text-[10px] font-bold shadow-[0_0_18px_rgba(220,38,38,0.35)]">
              Y
            </span>
            Analyzer
          </div>
          {([
            ["Home", "home"],
            ["Dashboard", "dashboard"],
            ["Video", "video"],
            ["Insights", "insights"],
            ["Channels", "channels"],
            ["Compare", "compare"],
            ["Settings", "settings"],
          ] as [string, IconName][]).map(([label, icon]) => (
            <button
              key={label}
              onClick={() => setActivePage(icon as typeof activePage)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-300 ${
                (activePage === icon)
                  ? "bg-white text-black"
                  : "bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <AppIcon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="relative lg:pl-[252px]">
        <div key={activePage} className="page-transition mx-auto w-full max-w-none px-3 py-4 pb-10 pt-16 sm:px-5 sm:py-6 lg:px-7 lg:pt-6 xl:px-8 2xl:px-10">
          <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl sm:p-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.9)]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/25">{activePage === "home" ? "youtube intelligence" : activePage}</p>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-[28px]">
                {activePage === "home" ? "YouTube Intelligence" : activePage === "dashboard" ? "Channel dashboard" : activePage === "video" ? "Video Analyzer" : activePage === "channels" ? "Saved channels" : activePage === "compare" ? "Compare channels" : "Settings"}
              </h1>
            </div>
            {activePage === "dashboard" && <div className="flex w-full max-w-xl gap-2">
              <input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") analyzeChannel(url); }} placeholder="Paste a YouTube channel URL or @handle" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none ring-0 transition-all duration-300 placeholder:text-white/20 focus:border-red-400/30 focus:bg-black/30 focus:shadow-[0_0_0_4px_rgba(248,113,113,0.05)]" />
              <button onClick={() => analyzeChannel(url)} disabled={loading} className="button-sheen rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-all duration-300 hover:-translate-y-px hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Analyzing..." : "Analyze"}</button>
            </div>}
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          {activePage === "home" && <div>
            <div className="premium-card shine-slow mb-5 rounded-[28px] p-6 sm:p-8 xl:p-10">
              <div className="hero-glow -right-16 -top-20 h-56 w-56 bg-red-500/15" />
              <div className="hero-glow -bottom-28 left-1/3 h-64 w-64 bg-blue-500/10" />
              <div className="relative z-10 grid gap-8 xl:grid-cols-[1.5fr_.8fr] xl:items-end">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,.9)]" />
                    Live public intelligence
                  </div>
                  <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl xl:text-6xl">
                    See what is <span className="bg-gradient-to-r from-white via-white to-red-300 bg-clip-text text-transparent">moving</span> on YouTube.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-white/45 sm:text-[15px]">
                    A live intelligence layer for popular videos, rising signals, recurring topics, categories, and channels across the selected market.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-[10px] text-white/45">Region <span className="ml-1 font-semibold text-white/75">{homeRegion}</span></div>
                    <div className="rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-[10px] text-white/45">Source <span className="ml-1 font-semibold text-white/75">YouTube Data API</span></div>
                    <div className="rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-[10px] text-white/45">Mode <span className="ml-1 font-semibold text-emerald-300">Live</span></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/25">Market snapshot</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {homeRegion === "PH"
                          ? "Philippines"
                          : homeRegion}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={homeRegion}
                        onChange={(event) => {
                          const nextRegion =
                            event.target.value;

                          setHomeRegion(
                            nextRegion
                          );

                          fetchHomeData(
                            nextRegion
                          );
                        }}
                        className="rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-[10px] font-medium text-white/80 outline-none transition hover:border-white/20 focus:border-red-400/40"
                        aria-label="Select YouTube market"
                      >
                        <option value="PH">
                          🇵🇭 Philippines
                        </option>
                        <option value="US">
                          🇺🇸 United States
                        </option>
                        <option value="GB">
                          🇬🇧 United Kingdom
                        </option>
                        <option value="CA">
                          🇨🇦 Canada
                        </option>
                        <option value="AU">
                          🇦🇺 Australia
                        </option>
                        <option value="JP">
                          🇯🇵 Japan
                        </option>
                        <option value="KR">
                          🇰🇷 South Korea
                        </option>
                        <option value="SG">
                          🇸🇬 Singapore
                        </option>
                        <option value="IN">
                          🇮🇳 India
                        </option>
                      </select>

                      <button
                        onClick={() =>
                          fetchHomeData(
                            homeRegion
                          )
                        }
                        disabled={homeLoading}
                        className="button-sheen rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[10px] font-medium text-white/65 transition hover:bg-white/[0.1] disabled:opacity-40"
                      >
                        {homeLoading
                          ? "Updating"
                          : "Refresh"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/6 bg-white/[0.025] p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Top video</p>
                      <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-white/80">{homeSnapshot.topVideo?.title || "Waiting for data"}</p>
                    </div>
                    <div className="rounded-xl border border-white/6 bg-white/[0.025] p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Top topic</p>
                      <p className="mt-2 text-lg font-semibold tracking-tight text-white">{homeSnapshot.topTopic ? getHomeTopicName(homeSnapshot.topTopic) : "—"}</p>
                      <p className="mt-1 text-[9px] text-white/30">{homeSnapshot.topTopic ? `${getHomeTopicCount(homeSnapshot.topTopic)} mentions` : "Awaiting data"}</p>
                    </div>
                  </div>
                  <div className="mt-2 rounded-xl border border-white/6 bg-white/[0.025] p-3">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Visible views</p>
                        <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">{homeLoading ? "…" : formatCompact(homeSnapshot.totalViews)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Updated</p>
                        <p className="mt-1 text-[11px] font-medium text-white/55">{homeData ? formatRelativeTime(homeData.fetchedAt) : "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
              <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,.75)]" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25">Live signals</span>
              </div>
              <div className="overflow-hidden py-2.5">
                <div className="marquee-track">
                  {[0,1].map((copy) => (
                    <div key={copy} className="flex items-center gap-2 px-2">
                      {(homeData?.topics || []).slice(0, 8).map((topic, index) => (
                        <div key={`${copy}-${getHomeTopicName(topic)}-${index}`} className="topic-chip whitespace-nowrap rounded-full border border-white/7 bg-white/[0.035] px-3 py-1.5 text-[10px] text-white/48">
                          <span className="text-white/80">#{index + 1}</span> {getHomeTopicName(topic)} <span className="ml-1 text-red-300/80">{getHomeTopicCount(topic)}</span>
                        </div>
                      ))}
                      {(!homeData || homeData.topics.length === 0) && <div className="px-3 text-[10px] text-white/25">Waiting for live topic signals…</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <HomeSignalCard label="Trending" value={homeLoading ? "…" : formatNumber(homeData?.trending.length || 0)} detail="Popular videos returned" icon={<AppIcon name="dashboard" size={18} />} />
              <HomeSignalCard label="Rising" value={homeLoading ? "…" : formatNumber(homeData?.rising.length || 0)} detail="Velocity estimates" icon={<span className="text-base">↗</span>} />
              <HomeSignalCard label="Topics" value={homeLoading ? "…" : formatNumber(homeData?.topics.length || 0)} detail="Repeated title signals" icon={<span className="text-base">#</span>} />
              <HomeSignalCard label="Channels" value={homeLoading ? "…" : formatNumber(homeData?.channels.length || 0)} detail="Channels represented" icon={<AppIcon name="channels" size={18} />} />
            </div>

            {homeError && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"><p className="text-sm text-red-300">{homeError}</p><button onClick={() => fetchHomeData(homeRegion)} className="mt-2 text-xs text-red-200 underline underline-offset-4">Try again</button></div>}

            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Trending videos" value={homeLoading ? "..." : formatNumber(homeData?.trending.length || 0)} description="Videos returned for this region" />
              <StatCard label="Rising signals" value={homeLoading ? "..." : formatNumber(homeData?.rising.length || 0)} description="Estimated by views / hour" />
              <StatCard label="Hot topics" value={homeLoading ? "..." : formatNumber(homeData?.topics.length || 0)} description="Repeated terms in current titles" />
              <StatCard label="Channels detected" value={homeLoading ? "..." : formatNumber(homeData?.channels.length || 0)} description="Channels represented in the chart" />
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-[1.65fr_.85fr]">
              <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <SectionTitle title="Trending now" description={`Current popular YouTube videos for ${homeRegion}.`} />
                <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"><p className="text-[10px] leading-5 text-white/30">The current <span className="text-white/45">mostPopular</span> chart reflects popular Music, Movies, and Gaming content rather than the former general Trending Now feed.</p></div>
                {homeLoading && !homeData ? <HomeLoadingRows /> : homeData?.trending.length ? homeData.trending.slice(0, 10).map((video, index) => <HomeVideoRow key={video.id} video={video} rank={index + 1} />) : <EmptyChart text="No trending data returned." />}
              </div>
              <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <SectionTitle title="Hot topics" description="Words appearing repeatedly across the current dataset." />
                {homeLoading && !homeData ? <HomeLoadingRows /> : homeData?.topics.length ? <div className="space-y-2">{homeData.topics.slice(0, 10).map((topic, index) => <div key={`${getHomeTopicName(topic)}-${index}`} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{getHomeTopicName(topic)}</p><p className="mt-1 text-[10px] text-white/30">{getHomeTopicCount(topic)} mentions{getHomeTopicViews(topic) > 0 ? ` · ${formatCompact(getHomeTopicViews(topic))} views` : ""}</p></div><div className="ml-3 flex h-8 min-w-8 items-center justify-center rounded-lg bg-red-500/10 px-2 text-xs font-semibold text-red-300">{getHomeTopicCount(topic)}</div></div>)}</div> : <EmptyChart text="No repeated topics detected." />}
                <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3"><p className="text-[10px] leading-5 text-white/25">Topic detection is an app-generated signal based on repeated title terms. It is not an official YouTube topic analytics feed.</p></div>
              </div>
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
              <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Rising fast" description="Videos with the highest estimated current views-per-hour." />{homeLoading && !homeData ? <HomeLoadingRows /> : homeData?.rising.length ? <>{homeData.rising.slice(0, 8).map((video, index) => <HomeVideoRow key={video.id} video={video} rank={index + 1} rising />)}<div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3"><p className="text-[10px] leading-5 text-white/25">Rising is an estimate calculated from current views and publication age. It is not an official YouTube velocity metric.</p></div></> : <EmptyChart text="No rising signals available." />}</div>
              <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Channels to watch" description="Channels appearing most strongly across the returned popular-video dataset." />{homeLoading && !homeData ? <HomeLoadingRows /> : homeData?.channels.length ? homeData.channels.slice(0, 10).map((channelItem, index) => <HomeChannelRow key={channelItem.channelId || `${getHomeChannelName(channelItem)}-${index}`} channel={channelItem} rank={index + 1} />) : <EmptyChart text="No channel data available." />}</div>
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-2">
              <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Category breakdown" description="Distribution by YouTube category." />{homeCategoryChartData.length ? <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={homeCategoryChartData} layout="vertical" margin={{ left: 10, right: 15 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis type="number" allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="videos" name="Videos" radius={[0, 5, 5, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div> : <EmptyChart text="No category data available." />}</div>
              <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Category mix" description="Share of returned videos by category." />{homeCategoryPieData.length ? <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={homeCategoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={92} innerRadius={55} paddingAngle={3}>{homeCategoryPieData.map((entry, index) => <Cell key={entry.name} fill={CHART_RED_COLORS[index % CHART_RED_COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer></div> : <EmptyChart text="No category data available." />}</div>
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-2">
              <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Trending by views" description="Highest-viewed videos in the current popular dataset." />{homeTrendingChartData.length ? <div className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={homeTrendingChartData} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={150} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="views" name="Views" radius={[0, 5, 5, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div> : <EmptyChart text="No trending chart data." />}</div>
              <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Rising velocity" description="Videos with the highest estimated views per hour." />{homeRisingChartData.length ? <div className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={homeRisingChartData} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={150} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="viewsPerHour" name="Views / hour" radius={[0, 5, 5, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div> : <EmptyChart text="No rising chart data." />}<div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"><p className="text-[10px] leading-5 text-white/25">Velocity is an application estimate based on current views and video age.</p></div></div>
              <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Hot topic frequency" description="Most repeated title terms in the current popular dataset." />{homeTopicChartData.length ? <div className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={homeTopicChartData} margin={{ bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={75} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="mentions" name="Mentions" radius={[5, 5, 0, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div> : <EmptyChart text="No topic chart data." />}</div>
              <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Channel reach" description="Aggregated views from channels represented in the current dataset." />{homeChannelChartData.length ? <div className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={homeChannelChartData} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={125} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="views" name="Views" radius={[0, 5, 5, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div> : <EmptyChart text="No channel chart data." />}</div>
            </div>

            <div className="mb-6 chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <SectionTitle title="Category performance" description="Reach and engagement calculated from the returned popular videos." />
              {homeCategoryPerformanceData.length > 0 ? (
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={homeCategoryPerformanceData} margin={{ left: 5, right: 15, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="views" name="Total views" radius={[5, 5, 0, 0]} fill={CHART_RED} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart text="No category performance data." />
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><p className="text-xs leading-5 text-white/30">Public YouTube intelligence is based on data available through the YouTube Data API. The Home page combines the regional popular-video chart with application-derived signals such as repeated title terms and views-per-hour estimates.</p></div>
          </div>}

          {activePage === "video" && <div className="space-y-6">
            <div className="premium-card shine-slow relative overflow-hidden rounded-[28px] p-6 sm:p-8">
              <div className="hero-glow -right-16 -top-20 h-56 w-56 bg-red-500/15" />
              <div className="hero-glow -bottom-24 left-1/3 h-52 w-52 bg-red-500/8" />

              <div className="relative z-10 grid gap-8 xl:grid-cols-[1.25fr_.8fr] xl:items-end">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,.9)]" />
                    Public video intelligence
                  </div>
                  <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                    Analyze one video in detail.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-white/45">
                    Get the public performance metrics YouTube exposes, plus a benchmark against the channel&apos;s recent uploads.
                  </p>
                </div>

                <div className="glass-card rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/25">Analyze a video</p>
                  <div className="flex gap-2">
                    <input
                      value={videoInput}
                      onChange={(event) => setVideoInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") analyzeVideo(videoInput); }}
                      placeholder="Paste a YouTube video URL or ID"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition-all duration-300 placeholder:text-white/20 focus:border-red-400/30 focus:bg-white/[0.06]"
                    />
                    <button
                      onClick={() => analyzeVideo(videoInput)}
                      disabled={videoLoading}
                      className="button-sheen shrink-0 rounded-xl bg-white px-4 py-3 text-xs font-semibold text-black transition-all duration-300 hover:-translate-y-px hover:bg-white/90 disabled:opacity-50"
                    >
                      {videoLoading ? "Analyzing..." : "Analyze"}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-white/20">Public data only. No Google sign-in required.</p>
                </div>
              </div>
            </div>

            {videoError && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{videoError}</div>}

            {!videoAnalysis && !videoLoading && !videoError && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Performance", "Views, likes, comments and engagement"],
                  ["Velocity", "Views per hour and views per day"],
                  ["Benchmark", "Compare with recent channel uploads"],
                  ["Metadata", "Duration, category, captions and title info"],
                ].map(([title, description]) => (
                  <div key={title} className="glass-card group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-red-400/20 hover:bg-white/[0.045]">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-300 transition-transform duration-300 group-hover:scale-110">
                      <AppIcon name="video" size={16} />
                    </div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-white/30">{description}</p>
                  </div>
                ))}
              </div>
            )}

            {videoLoading && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="h-3 w-24 rounded bg-white/5" />
                    <div className="mt-4 h-8 w-28 rounded bg-white/5" />
                    <div className="mt-3 h-2 w-full rounded bg-white/5" />
                  </div>
                ))}
              </div>
            )}

            {videoAnalysis && (
              <>
                <div className="glass-card overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="grid xl:grid-cols-[1.25fr_.75fr]">
                    <div className="relative min-h-[300px] overflow-hidden border-b border-white/10 xl:border-b-0 xl:border-r">
                      {videoAnalysis.video.thumbnail && <img src={videoAnalysis.video.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
                      <div className="absolute inset-0 bg-gradient-to-br from-black/35 via-black/70 to-[#0b0b0b]" />
                      <div className="relative flex min-h-[300px] flex-col justify-end p-6 sm:p-8">
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-[10px] font-medium text-red-300">{videoAnalysis.video.channelTitle}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] text-white/45">{formatDuration(videoAnalysis.video.durationSeconds)}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] text-white/45">{formatVideoAge(videoAnalysis.video.ageHours)} old</span>
                        </div>
                        <h2 className="max-w-4xl text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{videoAnalysis.video.title}</h2>
                        <p className="mt-3 text-xs text-white/35">Published {formatDate(videoAnalysis.video.publishedAt)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-px bg-white/5">
                      {[
                        ["Views", formatCompact(videoAnalysis.video.views)],
                        ["Likes", formatCompact(videoAnalysis.video.likes)],
                        ["Comments", formatCompact(videoAnalysis.video.comments)],
                        ["Engagement", `${videoAnalysis.video.engagementRate.toFixed(2)}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-[#0d0e11] p-5 sm:p-6">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-white/25">{label}</p>
                          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Views / hour" value={formatCompact(videoAnalysis.video.viewsPerHour)} description="Current rate based on video age" />
                  <StatCard label="Views / day" value={formatCompact(videoAnalysis.video.viewsPerDay)} description="Current daily rate estimate" />
                  <StatCard label="Likes / 1K views" value={videoAnalysis.video.likesPerThousandViews.toFixed(2)} description="Public engagement density" />
                  <StatCard label="Comments / 1K" value={videoAnalysis.video.commentsPerThousandViews.toFixed(2)} description="Public comment density" />
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
                  <div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <SectionTitle title="Channel benchmark" description={`Compared with ${videoAnalysis.benchmark.sampleSize} recent uploads from the same channel.`} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricCard label="Position" value={`${videoAnalysis.benchmark.rank} / ${videoAnalysis.benchmark.totalCompared}`} description="By current views" />
                      <MetricCard label="Vs average" value={`${videoAnalysis.benchmark.performanceMultiple.toFixed(2)}×`} description={`${videoAnalysis.benchmark.aboveBenchmarkPercent >= 0 ? "+" : ""}${videoAnalysis.benchmark.aboveBenchmarkPercent.toFixed(0)}% vs recent average`} />
                      <MetricCard label="Percentile" value={`${videoAnalysis.benchmark.percentile.toFixed(0)}th`} description="Within compared uploads" />
                    </div>

                    <div className="mt-5 h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: "This video", views: videoAnalysis.video.views },
                          { name: "Recent avg", views: videoAnalysis.benchmark.averageViews },
                          { name: "Recent median", views: videoAnalysis.benchmark.medianViews },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatCompact} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="views" name="Views" fill={CHART_RED} radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <SectionTitle title="Video details" description="Public metadata returned by YouTube." />
                    <MetricLine label="Category ID" value={videoAnalysis.video.categoryId || "N/A"} />
                    <MetricLine label="Quality" value={videoAnalysis.video.definition.toUpperCase()} />
                    <MetricLine label="Captions" value={videoAnalysis.video.captionsAvailable ? "Available" : "Not available"} />
                    <MetricLine label="Title length" value={`${videoAnalysis.video.titleLength} characters`} />
                    <MetricLine label="Description length" value={`${videoAnalysis.video.descriptionLength} characters`} />
                    <MetricLine label="Tags" value={formatNumber(videoAnalysis.video.tagsCount)} />
                    <MetricLine label="Video age" value={formatVideoAge(videoAnalysis.video.ageHours)} />
                  </div>
                </div>

                {videoAnalysis.benchmark.recentVideos.length > 0 && (
                  <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <SectionTitle title="Recent channel uploads" description="The benchmark sample used to contextualize this video's performance." />
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {videoAnalysis.benchmark.recentVideos.map((recentVideo) => (
                        <div key={recentVideo.id} className="group flex gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-px hover:border-white/10 hover:bg-white/[0.04]">
                          {recentVideo.thumbnail ? <img src={recentVideo.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded-xl object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="h-14 w-24 shrink-0 rounded-xl bg-white/5" />}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium leading-5 text-white">{recentVideo.title}</p>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-white/30">
                              <span>{formatRelativeTime(recentVideo.publishedAt)}</span>
                              <span className="font-medium text-white/55">{formatCompact(recentVideo.views)} views</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <p className="text-xs leading-5 text-white/30">Public video analysis uses data returned by the YouTube Data API. Current view, like, and comment counts can change over time.</p>
                </div>
              </>
            )}
          </div>}

          {activePage === "dashboard" && <>
            {!channel ? <EmptyPage title="Analyze a YouTube channel" description="Paste a channel URL or handle above to see video performance, upload behavior, engagement, content mix, and historical growth." /> : <>
              <div className="mb-6 glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-center gap-4">{channel.thumbnail ? <img src={channel.thumbnail} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="h-16 w-16 rounded-full bg-white/10" />}<div className="min-w-0"><h2 className="truncate text-xl font-semibold">{channel.title}</h2><p className="mt-1 text-xs text-white/30">{formatCompact(channel.subscribers)} subscribers · {formatCompact(channel.views)} total views · {formatNumber(channel.videos)} videos</p></div></div><button onClick={saveCurrentChannel} disabled={isChannelSaved()} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 transition hover:bg-white/10 disabled:opacity-40">{isChannelSaved() ? "Saved" : "Save Channel"}</button></div></div>

              <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><FilterButton active={videoFilter === "all"} onClick={() => setVideoFilter("all")}>All Videos</FilterButton><FilterButton active={videoFilter === "long"} onClick={() => setVideoFilter("long")}>Long-form</FilterButton><FilterButton active={videoFilter === "shorts"} onClick={() => setVideoFilter("shorts")}>Shorts</FilterButton></div><p className="text-xs text-white/30">{filteredVideos.length} videos analyzed · Shorts ≤ 60 seconds</p></div>

              <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-white/40">Analysis coverage</p><p className="text-xs text-white/60">Up to 500 recent videos fetched from the channel</p></div></div>

              {insights.length > 0 && <div className="mb-6"><SectionTitle title="Automatic insights" description="Observations generated from the analyzed video dataset." /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{insights.map((insight) => <div key={insight.title} className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-sm font-medium text-white">{insight.title}</p><p className="mt-2 text-xs leading-5 text-white/40">{insight.description}</p></div>)}</div></div>}

              <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Average views" value={formatCompact(analytics.averageViews)} description={`${getFilterLabel(videoFilter)} average`} /><StatCard label="Median views" value={formatCompact(analytics.medianViews)} description="Less affected by viral outliers" /><StatCard label="Engagement rate" value={`${analytics.engagementRate.toFixed(2)}%`} description="Likes + comments / views" /><StatCard label="Uploads / week" value={analytics.uploadsPerWeek.toFixed(1)} description={`Most common day: ${analytics.mostCommonUploadDay}`} /></div>
              <div className="mb-6 grid gap-4 md:grid-cols-3"><MetricCard label="Subscriber growth" value={channelHistory.length >= 2 ? `${growth.subscriberGrowth >= 0 ? "+" : ""}${formatCompact(growth.subscriberGrowth)}` : "—"} description={channelHistory.length >= 2 ? `${previousGrowth.subscribers >= 0 ? "+" : ""}${formatCompact(previousGrowth.subscribers)} since last snapshot` : "Analyze again later to measure growth"} /><MetricCard label="View growth" value={channelHistory.length >= 2 ? `${growth.viewGrowth >= 0 ? "+" : ""}${formatCompact(growth.viewGrowth)}` : "—"} description={channelHistory.length >= 2 ? `${previousGrowth.views >= 0 ? "+" : ""}${formatCompact(previousGrowth.views)} since last snapshot` : "Analyze again later to measure growth"} /><MetricCard label="Video growth" value={channelHistory.length >= 2 ? `${growth.videoGrowth >= 0 ? "+" : ""}${formatCompact(growth.videoGrowth)}` : "—"} description={channelHistory.length >= 2 ? `${previousGrowth.videos >= 0 ? "+" : ""}${formatCompact(previousGrowth.videos)} since last snapshot` : "Analyze again later to measure growth"} /></div>

              <div className="mb-6 glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Channel growth" description={channelHistory.length >= 2 ? `${channelHistory.length} historical snapshots recorded` : "Historical channel performance will appear after multiple analyses"} />{growthChartData.length >= 2 ? <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={growthChartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Line type="monotone" dataKey="subscribers" strokeWidth={2} dot={false} name="Subscribers" stroke={CHART_RED} activeDot={{ r: 4, fill: CHART_RED, stroke: "#0b0b0b", strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div> : <EmptyChart text="Analyze this channel again later to build the growth chart." />}</div>

              <div className="mb-6 glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><SectionTitle title="Video Momentum" description="Tracks how quickly individual videos are gaining views between channel analyses." /><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"><p className="text-[10px] text-white/30">Tracked</p><p className="mt-1 text-sm font-semibold text-white">{trackedMomentumVideos.length}</p></div><div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"><p className="text-[10px] text-white/30">Accelerating</p><p className="mt-1 text-sm font-semibold text-white">{acceleratingVideos.length}</p></div><div className="col-span-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 sm:col-span-1"><p className="text-[10px] text-white/30">Fastest</p><p className="mt-1 truncate text-sm font-semibold text-white">{fastestGrowingVideo ? `${formatCompact(fastestGrowingVideo.viewsPerDay)}/day` : "—"}</p></div></div></div>{trackedMomentumVideos.length > 0 ? trackedMomentumVideos.map((momentum, index) => <MomentumRow key={momentum.video.id} momentum={momentum} rank={index + 1} />) : <div className="flex min-h-[220px] flex-col items-center justify-center text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-xl">🚀</div><p className="text-sm font-medium text-white">Momentum tracking is collecting data</p><p className="mt-2 max-w-md text-xs leading-5 text-white/30">Analyze this channel again later. The first analysis creates a baseline snapshot, and the next analysis lets us calculate how quickly each video is growing.</p></div>}<div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"><p className="text-[11px] leading-5 text-white/30">A video needs at least two snapshots before growth can be calculated and three snapshots before acceleration can be measured.</p></div></div>

              <div className="mb-6 grid gap-4 xl:grid-cols-2"><div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Views over recent uploads" description="Newest analyzed videos plotted by publication date." />{viewsChartData.length ? <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={viewsChartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={formatCompact} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Line type="monotone" dataKey="views" strokeWidth={2} dot={false} name="Views" stroke={CHART_RED} activeDot={{ r: 4, fill: CHART_RED, stroke: "#0b0b0b", strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div> : <EmptyChart text="No video data available." />}</div><div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Upload behavior" description="Distribution of analyzed uploads by weekday." /><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={uploadDayData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={(value) => value.slice(0, 3)} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="uploads" name="Uploads" radius={[5, 5, 0, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div></div></div>

              <div className="mb-6 grid gap-4 xl:grid-cols-2"><div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Content duration" description="Video distribution by duration." /><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={durationData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="count" name="Videos" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div><div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Engagement mix" description="Likes and comments across analyzed videos." /><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={engagementData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={3}>{engagementData.map((entry, index) => <Cell key={entry.name} fill={CHART_RED_COLORS[index % CHART_RED_COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer></div></div></div>

              <div className="mb-6 grid gap-4 xl:grid-cols-2"><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Performance details" /><MetricLine label="Average likes" value={formatCompact(analytics.averageLikes)} /><MetricLine label="Average comments" value={formatCompact(analytics.averageComments)} /><MetricLine label="Average video length" value={formatDuration(analytics.averageVideoLength)} /><MetricLine label="Average views / day" value={formatCompact(analytics.averageViewsPerDay)} /><MetricLine label="Average days between uploads" value={`${analytics.averageDaysBetweenUploads.toFixed(1)} days`} /><MetricLine label="Most common upload day" value={analytics.mostCommonUploadDay} /></div><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Recent performance" description="Latest 10 analyzed videos." /><MetricLine label="Average views" value={formatCompact(analytics.recentAverageViews)} /><MetricLine label="Median views" value={formatCompact(analytics.recentMedianViews)} /><MetricLine label="Average likes" value={formatCompact(analytics.recentAverageLikes)} /><MetricLine label="Average comments" value={formatCompact(analytics.recentAverageComments)} /><MetricLine label="Overall average views" value={formatCompact(allAnalytics.averageViews)} /></div></div>

              <div className="mb-6 grid gap-4 xl:grid-cols-2"><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Top videos" description="Highest-viewed videos in the selected dataset." />{topVideos.length ? topVideos.map((video, index) => <VideoRow key={video.id} video={video} rank={index + 1} />) : <p className="py-8 text-center text-sm text-white/30">No videos found.</p>}</div><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Recent videos" description="Latest uploads in the selected dataset." />{recentVideos.length ? recentVideos.map((video) => <VideoRow key={video.id} video={video} />) : <p className="py-8 text-center text-sm text-white/30">No videos found.</p>}</div></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><p className="text-xs leading-5 text-white/30">Analysis uses the latest available video metadata returned by the YouTube Data API. Historical channel and video snapshots are recorded locally whenever you analyze this channel.</p></div>
            </>}
          </>}

          {activePage === "insights" && <div className="space-y-6">
            {!channel ? (
              <EmptyPage title="Analyze a channel first" description="Insights become available after the channel analyzer has a video dataset to work with." />
            ) : (
              <>
                <div className="premium-card relative overflow-hidden rounded-[28px] p-6 sm:p-8">
                  <div className="hero-glow -right-16 -top-20 h-56 w-56 bg-red-500/15" />
                  <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        Channel intelligence
                      </div>
                      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">What the data says about {channel.title}.</h2>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/40">A compact interpretation layer built from the videos you analyzed. It highlights patterns without pretending the sample is the whole channel.</p>
                    </div>
                    <button onClick={exportChannelReport} className="button-sheen shrink-0 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black transition-all duration-300 hover:-translate-y-px hover:bg-white/90">Export report</button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Strongest area" value={strongestCategory ? strongestCategory.name : "—"} description={strongestCategory ? `${formatCompact(strongestCategory.medianViews)} median views` : "Not enough data"} />
                  <StatCard label="Recent median" value={formatCompact(analytics.recentMedianViews)} description="Latest 10 analyzed uploads" />
                  <StatCard label="Dataset median" value={formatCompact(analytics.medianViews)} description="Selected video set" />
                  <StatCard label="Engagement" value={`${analytics.engagementRate.toFixed(2)}%`} description="Likes + comments / views" />
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
                  <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <SectionTitle title="Key findings" description="Signals generated from the current analyzed dataset." />
                    {insightCards.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {insightCards.map((item) => (
                          <div key={item.title} className="group rounded-2xl border border-white/7 bg-white/[0.025] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-red-400/15 hover:bg-white/[0.045]">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300">✦</span>
                              <div><p className="text-sm font-semibold text-white">{item.title}</p><p className="mt-2 text-xs leading-5 text-white/40">{item.description}</p></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyChart text="Analyze more videos to generate insights." />
                    )}
                  </div>

                  <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <SectionTitle title="Strongest content areas" description="Ordered by median views in this sample." />
                    <div className="space-y-3">
                      {contentCategoryData.slice(0, 6).map((item, index) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-[10px] font-semibold text-white/45">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-medium text-white">{item.name}</p><span className="text-[10px] text-white/30">{formatCompact(item.medianViews)}</span></div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(6, Math.min(100, (item.medianViews / Math.max(contentCategoryData[0]?.medianViews || 1, 1)) * 100))}%` }} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <SectionTitle title="Opportunity signals" description="Simple signals that point to content worth investigating further." />
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/7 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/20">Recent momentum</p><p className="mt-3 text-xl font-semibold text-white">{analytics.recentMedianViews > analytics.medianViews ? "Above median" : analytics.recentMedianViews < analytics.medianViews ? "Below median" : "Around median"}</p><p className="mt-1 text-xs text-white/35">Compared with the full selected dataset median.</p></div>
                    <div className="rounded-2xl border border-white/7 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/20">Best format</p><p className="mt-3 text-xl font-semibold text-white">{(() => { const shortStats = calculateAnalytics(filteredVideos.filter((v) => getVideoType(v) === "shorts")); const longStats = calculateAnalytics(filteredVideos.filter((v) => getVideoType(v) === "long")); if (!shortStats.medianViews && !longStats.medianViews) return "—"; return shortStats.medianViews > longStats.medianViews ? "Shorts" : "Long-form"; })()}</p><p className="mt-1 text-xs text-white/35">Based on median views in this sample.</p></div>
                    <div className="rounded-2xl border border-white/7 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/20">Upload rhythm</p><p className="mt-3 text-xl font-semibold text-white">{analytics.uploadsPerWeek.toFixed(1)} / week</p><p className="mt-1 text-xs text-white/35">Most common day: {analytics.mostCommonUploadDay}.</p></div>
                  </div>
                </div>
              </>
            )}
          </div>}

          {activePage === "channels" && <div>{savedChannels.length === 0 ? <EmptyPage title="No saved channels" description="Analyze a channel from the dashboard and save it here for quick access and comparisons." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{savedChannels.map((saved) => <div key={saved.id} className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-3">{saved.thumbnail ? <img src={saved.thumbnail} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="h-12 w-12 rounded-full bg-white/10" />}<div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{saved.title}</p><p className="mt-1 text-[10px] text-white/30">{saved.id}</p></div></div><div className="mt-5 flex gap-2"><button onClick={() => { setUrl(`https://youtube.com/channel/${saved.id}`); analyzeChannel(saved.id); }} className="button-sheen flex-1 rounded-xl bg-white px-3 py-2 text-xs font-medium text-black transition-all duration-300 hover:-translate-y-px hover:bg-white/90">Analyze</button><button onClick={() => removeSavedChannel(saved.id)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50 hover:bg-white/5 hover:text-white">Remove</button></div></div>)}</div>}</div>}

          {activePage === "compare" && <div>
            {savedChannels.length < 2 ? <EmptyPage title="Save at least two channels" description="Save two or more YouTube channels from the dashboard to compare their performance." /> : <>
              <div className="mb-6 glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Select channels" description="Choose exactly two saved channels." /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{savedChannels.map((saved) => { const selected = compareSelected.includes(saved.id); return <button key={saved.id} onClick={() => setCompareSelected((previous) => previous.includes(saved.id) ? previous.filter((id) => id !== saved.id) : previous.length >= 2 ? previous : [...previous, saved.id])} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${selected ? "border-white/30 bg-white/10" : "border-white/10 bg-white/[0.02] hover:bg-white/5"}`}>{saved.thumbnail ? <img src={saved.thumbnail} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-white/10" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{saved.title}</p><p className="mt-1 text-[10px] text-white/30">{selected ? "Selected" : "Select"}</p></div></button>; })}</div><div className="mt-5 flex items-center justify-between"><p className="text-xs text-white/30">{compareSelected.length} / 2 selected</p><button onClick={loadComparison} disabled={compareSelected.length !== 2 || compareLoading} className="button-sheen rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black transition-all duration-300 hover:-translate-y-px hover:bg-white/90 disabled:opacity-40">{compareLoading ? "Loading..." : "Compare"}</button></div></div>
              {compareError && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{compareError}</div>}
              {compareData.length === 2 && <>
                <div className="mb-5 flex items-center gap-2"><FilterButton active={compareFilter === "all"} onClick={() => setCompareFilter("all")}>All Videos</FilterButton><FilterButton active={compareFilter === "long"} onClick={() => setCompareFilter("long")}>Long-form</FilterButton><FilterButton active={compareFilter === "shorts"} onClick={() => setCompareFilter("shorts")}>Shorts</FilterButton></div>
                <div className="mb-6 overflow-x-auto glass-card rounded-2xl border border-white/10 bg-white/[0.03]"><table className="w-full min-w-[700px]"><thead><tr className="border-b border-white/10"><th className="px-4 py-4 text-left text-xs font-medium text-white/30">Metric</th><th className="px-4 py-4 text-right text-xs font-medium text-white/30">{compareFiltered[0].channel.title}</th><th className="px-4 py-4 text-right text-xs font-medium text-white/30">{compareFiltered[1].channel.title}</th></tr></thead><tbody>
                  {[['Subscribers', formatCompact(compareFiltered[0].channel.subscribers), formatCompact(compareFiltered[1].channel.subscribers)], ['Average views', formatCompact(calculateAnalytics(compareFiltered[0].videos).averageViews), formatCompact(calculateAnalytics(compareFiltered[1].videos).averageViews)], ['Median views', formatCompact(calculateAnalytics(compareFiltered[0].videos).medianViews), formatCompact(calculateAnalytics(compareFiltered[1].videos).medianViews)], ['Average likes', formatCompact(calculateAnalytics(compareFiltered[0].videos).averageLikes), formatCompact(calculateAnalytics(compareFiltered[1].videos).averageLikes)], ['Average comments', formatCompact(calculateAnalytics(compareFiltered[0].videos).averageComments), formatCompact(calculateAnalytics(compareFiltered[1].videos).averageComments)], ['Engagement rate', `${calculateAnalytics(compareFiltered[0].videos).engagementRate.toFixed(2)}%`, `${calculateAnalytics(compareFiltered[1].videos).engagementRate.toFixed(2)}%`], ['Uploads / week', calculateAnalytics(compareFiltered[0].videos).uploadsPerWeek.toFixed(1), calculateAnalytics(compareFiltered[1].videos).uploadsPerWeek.toFixed(1)], ['Average video length', formatDuration(calculateAnalytics(compareFiltered[0].videos).averageVideoLength), formatDuration(calculateAnalytics(compareFiltered[1].videos).averageVideoLength)]].map((row) => <tr key={row[0]} className="border-b border-white/5 last:border-0"><td className="px-4 py-4 text-sm text-white/50">{row[0]}</td><td className="px-4 py-4 text-right text-sm font-medium text-white">{row[1]}</td><td className="px-4 py-4 text-right text-sm font-medium text-white">{row[2]}</td></tr>)}
                </tbody></table></div>
                <div className="grid gap-4 xl:grid-cols-2"><div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Average views" /><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={compareFiltered.map((dataset) => ({ name: dataset.channel.title, views: calculateAnalytics(dataset.videos).averageViews }))}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={formatCompact} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="views" name="Average views" radius={[5, 5, 0, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div></div><div className="chart-card glass-card rounded-2xl border border-white/10 bg-white/[0.035] p-5"><SectionTitle title="Engagement & frequency" /><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={compareFiltered.map((dataset) => { const stats = calculateAnalytics(dataset.videos); return { name: dataset.channel.title, engagement: stats.engagementRate, uploads: stats.uploadsPerWeek }; })}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="engagement" name="Engagement %" radius={[5, 5, 0, 0]} fill={CHART_RED} /><Bar dataKey="uploads" name="Uploads / week" radius={[5, 5, 0, 0]} fill={CHART_RED} /></BarChart></ResponsiveContainer></div></div></div>
              </>}
            </>}
          </div>}

          {activePage === "settings" && <div className="grid gap-4 xl:grid-cols-2"><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="API configuration" description="YouTube Data API configuration for this application." /><MetricLine label="Provider" value="YouTube Data API v3" /><MetricLine label="API key" value="Configured server-side" /><MetricLine label="Video fetch limit" value="Up to 500 videos" /></div><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5"><SectionTitle title="Local storage" description="Your saved channels and historical snapshots are stored in this browser." /><MetricLine label="Saved channels" value={formatNumber(savedChannels.length)} /><MetricLine label="Channels with history" value={formatNumber(Object.keys(history).length)} /><MetricLine label="Tracked videos" value={formatNumber(Object.keys(videoHistory).length)} /><MetricLine label="Snapshots / video" value={`${MAX_VIDEO_HISTORY_SNAPSHOTS} maximum`} /><MetricLine label="Maximum tracked videos" value={formatNumber(MAX_TRACKED_VIDEOS)} /></div><div className="glass-card rounded-2xl border border-white/10 bg-white/[0.03] p-5 xl:col-span-2"><SectionTitle title="Analysis coverage" description="Current limits of the dashboard." /><MetricLine label="Videos fetched per analysis" value="Up to 500" /><MetricLine label="Shorts classification" value="60 seconds or less" /><MetricLine label="Channel historical snapshots" value="100 per channel" /><MetricLine label="Video historical snapshots" value={`${MAX_VIDEO_HISTORY_SNAPSHOTS} per video`} /><MetricLine label="Video momentum" value="Requires at least 2 analyses" /><MetricLine label="Home region" value={homeRegion} /><MetricLine label="Home intelligence" value="Public YouTube data" /><MetricLine label="Video analyzer" value="Public video analytics" /></div></div>}
          <footer className="mt-8 border-t border-white/8 pt-5 text-center lg:text-left">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/15">YouTube Analyzer</p>
            <p className="mt-1 text-[11px] text-white/30">Developed by <span className="font-medium text-white/55">Clart Kent Nailgas</span></p>
          </footer>
        </div>
      </main>
    </div>
  );
}
