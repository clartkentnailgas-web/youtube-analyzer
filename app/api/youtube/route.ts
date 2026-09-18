import { NextRequest, NextResponse } from "next/server";

type YouTubeVideo = {
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
  channelId?: string;
  channelTitle?: string;
};

type TrendingVideo = YouTubeVideo & {
  rank: number;
  viewsPerHour: number;
  ageHours: number;
};

type TopicResult = {
  topic: string;
  mentions: number;
};

const DEFAULT_VIDEO_LIMIT = 500;
const MAX_VIDEO_LIMIT = 2000;
const PAGE_SIZE = 50;

const DEFAULT_REGION = "PH";

// Common words that don't provide useful topic information.
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "you",
  "your",
  "this",
  "that",
  "with",
  "from",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "will",
  "just",
  "into",
  "about",
  "what",
  "when",
  "where",
  "why",
  "how",
  "who",
  "its",
  "it's",
  "our",
  "their",
  "they",
  "them",
  "then",
  "than",
  "but",
  "not",
  "all",
  "can",
  "could",
  "would",
  "should",
  "been",
  "being",
  "over",
  "more",
  "most",
  "very",
  "only",
  "also",
  "new",
  "now",
  "get",
  "got",
  "getting",
  "make",
  "made",
  "making",
  "one",
  "two",
  "three",
  "first",
  "last",
  "day",
  "days",
  "week",
  "weeks",
  "today",
  "official",
  "video",
  "videos",
  "shorts",
  "short",
  "watch",
  "youtube",
  "channel",
  "episode",
  "part",
  "full",
  "live",
  "live!",
]);

function formatError(message: string, status = 500) {
  return NextResponse.json(
    {
      error: message,
    },
    { status }
  );
}

async function youtubeFetch(
  url: string
) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "YouTube API request failed."
    );
  }

  return data;
}

function calculateAgeHours(
  publishedAt: string
) {
  const published =
    new Date(publishedAt).getTime();

  const now = Date.now();

  const hours =
    (now - published) /
    (1000 * 60 * 60);

  return Math.max(hours, 0.25);
}

function extractTopics(
  videos: YouTubeVideo[]
): TopicResult[] {
  const counts = new Map<
    string,
    number
  >();

  for (const video of videos) {
    const title =
      video.title
        .toLowerCase()
        .replace(
          /https?:\/\/\S+/g,
          " "
        )
        .replace(
          /[^\p{L}\p{N}\s#]/gu,
          " "
        );

    const words =
      title.split(/\s+/);

    const uniqueWords =
      new Set<string>();

    for (const rawWord of words) {
      const word =
        rawWord
          .replace(/^#+/, "")
          .trim();

      if (
        word.length < 3 ||
        word.length > 30 ||
        STOP_WORDS.has(word) ||
        /^\d+$/.test(word)
      ) {
        continue;
      }

      uniqueWords.add(word);
    }

    for (const word of uniqueWords) {
      counts.set(
        word,
        (counts.get(word) || 0) + 1
      );
    }
  }

  return [...counts.entries()]
    .map(
      ([topic, mentions]) => ({
        topic,
        mentions,
      })
    )
    .filter(
      (item) => item.mentions >= 2
    )
    .sort(
      (a, b) =>
        b.mentions - a.mentions
    )
    .slice(0, 15);
}

async function getCategoryMap(
  apiKey: string,
  region: string
) {
  const url =
    "https://www.googleapis.com/youtube/v3/videoCategories" +
    "?part=snippet" +
    "&regionCode=" +
    encodeURIComponent(region) +
    "&key=" +
    encodeURIComponent(apiKey);

  const data =
    await youtubeFetch(url);

  const map = new Map<
    string,
    string
  >();

  for (const item of data.items || []) {
    if (
      item.id &&
      item.snippet?.title
    ) {
      map.set(
        item.id,
        item.snippet.title
      );
    }
  }

  return map;
}

async function getTrendingVideos(
  apiKey: string,
  region: string
): Promise<TrendingVideo[]> {
  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    "?part=snippet,statistics,contentDetails" +
    "&chart=mostPopular" +
    "&regionCode=" +
    encodeURIComponent(region) +
    "&maxResults=50" +
    "&key=" +
    encodeURIComponent(apiKey);

  const data =
    await youtubeFetch(url);

  const categoryMap =
    await getCategoryMap(
      apiKey,
      region
    );

  const videos: TrendingVideo[] =
    (data.items || []).map(
      (video: any, index: number) => {
        const publishedAt =
          video.snippet
            ?.publishedAt || "";

        const views = Number(
          video.statistics
            ?.viewCount || 0
        );

        const ageHours =
          calculateAgeHours(
            publishedAt
          );

        return {
          id: video.id,

          title:
            video.snippet?.title ||
            "",

          description:
            video.snippet
              ?.description || "",

          thumbnail:
            video.snippet
              ?.thumbnails?.high
              ?.url ||
            video.snippet
              ?.thumbnails?.medium
              ?.url,

          publishedAt,

          duration:
            video.contentDetails
              ?.duration || "PT0S",

          views,

          likes: Number(
            video.statistics
              ?.likeCount || 0
          ),

          comments: Number(
            video.statistics
              ?.commentCount || 0
          ),

          categoryId:
            video.snippet
              ?.categoryId,

          categoryName:
            categoryMap.get(
              video.snippet
                ?.categoryId
            ) ||
            "Other",

          channelId:
            video.snippet
              ?.channelId,

          channelTitle:
            video.snippet
              ?.channelTitle ||
            "",

          rank: index + 1,

          ageHours,

          viewsPerHour:
            views / ageHours,
        };
      }
    );

  return videos;
}

async function getChannelData(
  apiKey: string,
  handle: string | null,
  channelId: string | null,
  videoLimit: number
) {
  // ==================================================
  // 1. FIND CHANNEL
  // ==================================================

  let channelUrl = "";

  if (channelId) {
    channelUrl =
      "https://www.googleapis.com/youtube/v3/channels" +
      "?part=snippet,statistics,contentDetails" +
      "&id=" +
      encodeURIComponent(channelId) +
      "&key=" +
      encodeURIComponent(apiKey);
  } else if (handle) {
    const cleanHandle =
      handle.replace(/^@/, "");

    channelUrl =
      "https://www.googleapis.com/youtube/v3/channels" +
      "?part=snippet,statistics,contentDetails" +
      "&forHandle=@" +
      encodeURIComponent(
        cleanHandle
      ) +
      "&key=" +
      encodeURIComponent(apiKey);
  } else {
    throw new Error(
      "Channel handle or channel ID is required."
    );
  }

  const channelData =
    await youtubeFetch(channelUrl);

  if (
    !channelData.items?.length
  ) {
    throw new Error(
      "Channel not found."
    );
  }

  const channel =
    channelData.items[0];

  const uploadsPlaylistId =
    channel.contentDetails
      ?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error(
      "This channel does not have an accessible uploads playlist."
    );
  }

  // ==================================================
  // 2. GET VIDEO IDS
  // ==================================================

  const videoIds: string[] = [];

  let nextPageToken = "";

  let pagesFetched = 0;

  const maxPages = Math.ceil(
    videoLimit / PAGE_SIZE
  );

  while (
    videoIds.length < videoLimit &&
    pagesFetched < maxPages
  ) {
    const remaining =
      videoLimit -
      videoIds.length;

    const pageSize = Math.min(
      PAGE_SIZE,
      remaining
    );

    let playlistUrl =
      "https://www.googleapis.com/youtube/v3/playlistItems" +
      "?part=snippet,contentDetails" +
      "&playlistId=" +
      encodeURIComponent(
        uploadsPlaylistId
      ) +
      "&maxResults=" +
      pageSize +
      "&key=" +
      encodeURIComponent(apiKey);

    if (nextPageToken) {
      playlistUrl +=
        "&pageToken=" +
        encodeURIComponent(
          nextPageToken
        );
    }

    const playlistData =
      await youtubeFetch(
        playlistUrl
      );

    const items =
      playlistData.items || [];

    for (const item of items) {
      const videoId =
        item.contentDetails
          ?.videoId ||
        item.snippet?.resourceId
          ?.videoId;

      if (videoId) {
        videoIds.push(videoId);
      }
    }

    pagesFetched++;

    nextPageToken =
      playlistData.nextPageToken ||
      "";

    if (
      !nextPageToken ||
      items.length === 0
    ) {
      break;
    }
  }

  const uniqueVideoIds =
    [...new Set(videoIds)].slice(
      0,
      videoLimit
    );

  // ==================================================
  // 3. GET VIDEO DETAILS
  // ==================================================

  const videos: YouTubeVideo[] =
    [];

  for (
    let i = 0;
    i < uniqueVideoIds.length;
    i += PAGE_SIZE
  ) {
    const batch =
      uniqueVideoIds.slice(
        i,
        i + PAGE_SIZE
      );

    const videosUrl =
      "https://www.googleapis.com/youtube/v3/videos" +
      "?part=snippet,statistics,contentDetails" +
      "&id=" +
      batch
        .map((id) =>
          encodeURIComponent(id)
        )
        .join(",") +
      "&key=" +
      encodeURIComponent(apiKey);

    const videosData =
      await youtubeFetch(
        videosUrl
      );

    if (videosData.items) {
      videos.push(
        ...videosData.items.map(
          (video: any) => ({
            id: video.id,

            title:
              video.snippet?.title ||
              "",

            description:
              video.snippet
                ?.description || "",

            thumbnail:
              video.snippet
                ?.thumbnails?.high
                ?.url ||
              video.snippet
                ?.thumbnails?.medium
                ?.url,

            publishedAt:
              video.snippet
                ?.publishedAt || "",

            duration:
              video.contentDetails
                ?.duration || "PT0S",

            views: Number(
              video.statistics
                ?.viewCount || 0
            ),

            likes: Number(
              video.statistics
                ?.likeCount || 0
            ),

            comments: Number(
              video.statistics
                ?.commentCount || 0
            ),

            categoryId:
              video.snippet
                ?.categoryId,

            channelId:
              video.snippet
                ?.channelId,

            channelTitle:
              video.snippet
                ?.channelTitle ||
              "",
          })
        )
      );
    }
  }

  // ==================================================
  // 4. CATEGORY NAMES
  // ==================================================

  const categoryMap =
    await getCategoryMap(
      apiKey,
      DEFAULT_REGION
    );

  for (const video of videos) {
    if (video.categoryId) {
      video.categoryName =
        categoryMap.get(
          video.categoryId
        ) || "Other";
    }
  }

  // ==================================================
  // 5. SORT
  // ==================================================

  videos.sort(
    (a, b) =>
      new Date(
        b.publishedAt
      ).getTime() -
      new Date(
        a.publishedAt
      ).getTime()
  );

  // ==================================================
  // 6. RETURN
  // ==================================================

  return {
    channel: {
      id: channel.id,

      title:
        channel.snippet?.title ||
        "",

      description:
        channel.snippet
          ?.description || "",

      thumbnail:
        channel.snippet
          ?.thumbnails?.high?.url,

      subscribers: Number(
        channel.statistics
          ?.subscriberCount || 0
      ),

      views: Number(
        channel.statistics
          ?.viewCount || 0
      ),

      videos: Number(
        channel.statistics
          ?.videoCount || 0
      ),
    },

    videos,

    videoCountReturned:
      videos.length,

    requestedVideoLimit:
      videoLimit,

    pagesFetched,

    fetchedAt:
      new Date().toISOString(),
  };
}

export async function GET(
  request: NextRequest
) {
  const { searchParams } =
    new URL(request.url);

  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return formatError(
      "YouTube API key is missing.",
      500
    );
  }

  const action =
    searchParams.get("action");

  // ==================================================
  // HOME / YOUTUBE INTELLIGENCE
  // ==================================================

  if (action === "home") {
    try {
      const region =
        (
          searchParams.get(
            "region"
          ) || DEFAULT_REGION
        ).toUpperCase();

      const trending =
        await getTrendingVideos(
          apiKey,
          region
        );

      // ----------------------------------------------
      // CATEGORY BREAKDOWN
      // ----------------------------------------------

      const categoryCounts =
        new Map<
          string,
          number
        >();

      const categoryViews =
        new Map<
          string,
          number
        >();

      for (const video of trending) {
        const category =
          video.categoryName ||
          "Other";

        categoryCounts.set(
          category,
          (categoryCounts.get(
            category
          ) || 0) + 1
        );

        categoryViews.set(
          category,
          (categoryViews.get(
            category
          ) || 0) + video.views
        );
      }

      const categories =
        [...categoryCounts.entries()]
          .map(
            ([
              category,
              count,
            ]) => ({
              category,
              videos: count,
              views:
                categoryViews.get(
                  category
                ) || 0,
            })
          )
          .sort(
            (a, b) =>
              b.views - a.views
          );

      // ----------------------------------------------
      // TOPICS
      // ----------------------------------------------

      const topics =
        extractTopics(
          trending
        );

      // ----------------------------------------------
      // RISING SIGNALS
      // ----------------------------------------------
      //
      // This is NOT official YouTube velocity data.
      // It estimates momentum using current views
      // relative to the video's age.
      //
      // ----------------------------------------------

      const rising =
        [...trending]
          .sort(
            (a, b) =>
              b.viewsPerHour -
              a.viewsPerHour
          )
          .slice(0, 10);

      // ----------------------------------------------
      // TOP CHANNELS
      // ----------------------------------------------

      const channelMap =
        new Map<
          string,
          {
            channelId: string;
            channelTitle: string;
            videos: number;
            views: number;
          }
        >();

      for (const video of trending) {
        if (!video.channelId) {
          continue;
        }

        const existing =
          channelMap.get(
            video.channelId
          );

        if (existing) {
          existing.videos += 1;
          existing.views +=
            video.views;
        } else {
          channelMap.set(
            video.channelId,
            {
              channelId:
                video.channelId,

              channelTitle:
                video.channelTitle ||
                "Unknown Channel",

              videos: 1,

              views: video.views,
            }
          );
        }
      }

      const channels =
        [...channelMap.values()]
          .sort(
            (a, b) =>
              b.views - a.views
          )
          .slice(0, 10);

      return NextResponse.json({
        region,

        trending,

        rising,

        topics,

        categories,

        channels,

        fetchedAt:
          new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        "YouTube Home API error:",
        error
      );

      return formatError(
        error instanceof Error
          ? error.message
          : "Failed to retrieve YouTube intelligence data.",
        500
      );
    }
  }

  // ==================================================
  // CHANNEL ANALYZER
  // ==================================================

  const handle =
    searchParams.get("handle");

  const channelId =
    searchParams.get("id");

  const requestedLimit = Number(
    searchParams.get("limit") ||
      DEFAULT_VIDEO_LIMIT
  );

  const videoLimit = Math.min(
    Math.max(
      Number.isFinite(
        requestedLimit
      )
        ? requestedLimit
        : DEFAULT_VIDEO_LIMIT,
      1
    ),
    MAX_VIDEO_LIMIT
  );

  try {
    const data =
      await getChannelData(
        apiKey,
        handle,
        channelId,
        videoLimit
      );

    return NextResponse.json(
      data
    );
  } catch (error) {
    console.error(
      "YouTube API error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Failed to retrieve YouTube data.";

    const status =
      message ===
      "Channel not found."
        ? 404
        : message.includes(
            "required"
          )
        ? 400
        : 500;

    return formatError(
      message,
      status
    );
  }
}