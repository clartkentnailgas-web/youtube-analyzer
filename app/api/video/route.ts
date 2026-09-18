import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://www.googleapis.com/youtube/v3";

type YoutubeVideoItem = {
  id: string;
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    categoryId?: string;
    tags?: string[];
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: {
    duration?: string;
    definition?: string;
    caption?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

type YoutubeChannelItem = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
};

type YoutubePlaylistItem = {
  contentDetails?: {
    videoId?: string;
  };
};

type YoutubeListResponse<T> = {
  items?: T[];
  error?: {
    message?: string;
  };
};

function getApiKey() {
  const key = process.env.YOUTUBE_API_KEY;

  if (!key) {
    throw new Error("YOUTUBE_API_KEY is not configured.");
  }

  return key;
}

function parseNumber(value?: string) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function parseDuration(duration = "") {
  const match = duration.match(
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
  );

  if (!match) return 0;

  return (
    Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0)
  );
}

async function youtubeFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T> {
  const search = new URLSearchParams({
    ...params,
    key: getApiKey(),
  });

  const response = await fetch(
    `${API_BASE}/${endpoint}?${search.toString()}`,
    { cache: "no-store" }
  );

  const data = (await response.json()) as T & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        `YouTube API request failed (${response.status}).`
    );
  }

  return data;
}

function parseVideoId(input: string) {
  const value = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.hostname === "youtu.be") {
      return url.pathname.slice(1).split("/")[0] || null;
    }

    if (
      url.hostname === "youtube.com" ||
      url.hostname.endsWith(".youtube.com")
    ) {
      const queryId = url.searchParams.get("v");

      if (queryId) return queryId;

      const parts = url.pathname.split("/").filter(Boolean);

      const shortsIndex = parts.indexOf("shorts");
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
        return parts[shortsIndex + 1];
      }

      const liveIndex = parts.indexOf("live");
      if (liveIndex >= 0 && parts[liveIndex + 1]) {
        return parts[liveIndex + 1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

function buildVideo(item: YoutubeVideoItem) {
  const views = parseNumber(item.statistics?.viewCount);
  const likes = parseNumber(item.statistics?.likeCount);
  const comments = parseNumber(item.statistics?.commentCount);

  const publishedAt =
    item.snippet?.publishedAt ||
    new Date().toISOString();

  const ageHours = Math.max(
    1 / 24,
    (Date.now() - new Date(publishedAt).getTime()) /
      (1000 * 60 * 60)
  );

  return {
    id: item.id,
    title: item.snippet?.title || "Untitled video",
    description: item.snippet?.description || "",
    thumbnail:
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url,
    publishedAt,
    duration: item.contentDetails?.duration || "PT0S",
    durationSeconds: parseDuration(
      item.contentDetails?.duration || "PT0S"
    ),
    definition: item.contentDetails?.definition || "unknown",
    captionsAvailable:
      item.contentDetails?.caption === "true",
    views,
    likes,
    comments,
    channelId: item.snippet?.channelId || "",
    channelTitle:
      item.snippet?.channelTitle || "Unknown channel",
    categoryId: item.snippet?.categoryId || "",
    tagsCount: item.snippet?.tags?.length || 0,
    titleLength: (item.snippet?.title || "").length,
    descriptionLength: (item.snippet?.description || "").length,
    ageHours,
    viewsPerHour: views / ageHours,
    viewsPerDay:
      views / Math.max(ageHours / 24, 1 / 24),
    likesPerThousandViews:
      views > 0 ? (likes / views) * 1000 : 0,
    commentsPerThousandViews:
      views > 0 ? (comments / views) * 1000 : 0,
    engagementRate:
      views > 0 ? ((likes + comments) / views) * 100 : 0,
  };
}

async function getRecentChannelVideos(
  uploadsPlaylistId: string,
  excludeId: string
) {
  const playlist = await youtubeFetch<
    YoutubeListResponse<YoutubePlaylistItem>
  >("playlistItems", {
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: "12",
  });

  const ids = (playlist.items || [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => id !== excludeId);

  if (!ids.length) return [];

  const videos = await youtubeFetch<
    YoutubeListResponse<YoutubeVideoItem>
  >("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
  });

  return videos.items || [];
}

export async function GET(request: NextRequest) {
  try {
    const input =
      request.nextUrl.searchParams.get("url") ||
      request.nextUrl.searchParams.get("id") ||
      "";

    const videoId = parseVideoId(input);

    if (!videoId) {
      return NextResponse.json(
        {
          error:
            "Enter a valid YouTube video URL, Shorts URL, or 11-character video ID.",
        },
        { status: 400 }
      );
    }

    const videoResponse = await youtubeFetch<
      YoutubeListResponse<YoutubeVideoItem>
    >("videos", {
      part: "snippet,statistics,contentDetails",
      id: videoId,
    });

    const item = videoResponse.items?.[0];

    if (!item) {
      return NextResponse.json(
        { error: "Video not found." },
        { status: 404 }
      );
    }

    const video = buildVideo(item);

    let channel: ChannelResponse | null = null;
    let recentVideos: ReturnType<typeof buildVideo>[] = [];

    if (video.channelId) {
      const channelResponse = await youtubeFetch<
        YoutubeListResponse<YoutubeChannelItem>
      >("channels", {
        part: "snippet,statistics,contentDetails",
        id: video.channelId,
      });

      const channelItem = channelResponse.items?.[0];

      if (channelItem) {
        channel = {
          id: channelItem.id,
          title:
            channelItem.snippet?.title ||
            video.channelTitle,
          description:
            channelItem.snippet?.description || "",
          thumbnail:
            channelItem.snippet?.thumbnails?.high?.url ||
            channelItem.snippet?.thumbnails?.medium?.url ||
            channelItem.snippet?.thumbnails?.default?.url,
          subscribers: parseNumber(
            channelItem.statistics?.subscriberCount
          ),
          views: parseNumber(
            channelItem.statistics?.viewCount
          ),
          videos: parseNumber(
            channelItem.statistics?.videoCount
          ),
        };

        const uploadsPlaylist =
          channelItem.contentDetails?.relatedPlaylists?.uploads;

        if (uploadsPlaylist) {
          const recentItems =
            await getRecentChannelVideos(
              uploadsPlaylist,
              videoId
            );

          recentVideos = recentItems.map(buildVideo);
        }
      }
    }

    const benchmarkViews = recentVideos.map(
      (recentVideo) => recentVideo.views
    );

    const benchmarkAverage = benchmarkViews.length
      ? benchmarkViews.reduce(
          (sum, value) => sum + value,
          0
        ) / benchmarkViews.length
      : 0;

    const sortedBenchmark = [...recentVideos, video].sort(
      (a, b) => b.views - a.views
    );

    const rank =
      sortedBenchmark.findIndex(
        (candidate) => candidate.id === video.id
      ) + 1;

    const percentile =
      sortedBenchmark.length > 1
        ? ((sortedBenchmark.length - rank) /
            (sortedBenchmark.length - 1)) *
          100
        : 100;

    const performanceMultiple =
      benchmarkAverage > 0
        ? video.views / benchmarkAverage
        : 0;

    const aboveBenchmark =
      benchmarkAverage > 0
        ? ((video.views - benchmarkAverage) /
            benchmarkAverage) *
          100
        : 0;

    const medianValues = [...benchmarkViews].sort(
      (a, b) => a - b
    );

    const medianIndex = Math.floor(
      medianValues.length / 2
    );

    const benchmarkMedian =
      medianValues.length === 0
        ? 0
        : medianValues.length % 2 === 0
          ? (medianValues[medianIndex - 1] +
              medianValues[medianIndex]) /
            2
          : medianValues[medianIndex];

    return NextResponse.json({
      video,
      channel,
      benchmark: {
        sampleSize: recentVideos.length,
        averageViews: benchmarkAverage,
        medianViews: benchmarkMedian,
        rank,
        totalCompared: sortedBenchmark.length,
        percentile,
        performanceMultiple,
        aboveBenchmarkPercent: aboveBenchmark,
        recentVideos: recentVideos.map((recentVideo) => ({
          id: recentVideo.id,
          title: recentVideo.title,
          thumbnail: recentVideo.thumbnail,
          publishedAt: recentVideo.publishedAt,
          views: recentVideo.views,
          likes: recentVideo.likes,
          comments: recentVideo.comments,
        })),
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze video.",
      },
      { status: 500 }
    );
  }
}

type ChannelResponse = {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  subscribers: number;
  views: number;
  videos: number;
};
