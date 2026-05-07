import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const baseUrl = "https://www.tamildhool.tech";
// Hardcoded list of 4 serials and 4 shows
const HARDCODED_SHOWS = [
  // Serials
  {
    name: "Mahanadhi",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-serial/mahanadhi/",
    type: "serial",
    imageUrl: "",
  },
  {
    name: "Pandian Stores S2",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-serial/pandian-stores-s-2/",
    type: "serial",
    imageUrl: "",
  },
  {
    name: "Ayyanar Thunai",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-serial/ayyanar-thunai/",
    type: "serial",
    imageUrl: "",
  },
  {
    name: "Magale En Marumagale",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-serial/magale-en-marumagale/",
    type: "serial",
    imageUrl: "",
  },
  // Shows
  {
    name: "Cooku with Comali S7",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-show/cooku-with-comali-s7/",
    type: "show",
    imageUrl: "",
  },
  {
    name: "Super Singer S11",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-show/super-singer-s11/",
    type: "show",
    imageUrl: "",
  },
  {
    name: "Neeya Naana",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-show/neeya-naana/",
    type: "show",
    imageUrl: "",
  },
  {
    name: "Jodi Are U Ready S3",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-show/jodi-are-u-ready-s3/",
    type: "show",
    imageUrl: "",
  },
  {
    name: "Adhu Idhu Yedhu S4",
    url: "https://www.tamildhool.tech/vijay-tv/vijay-tv-show/adhu-idhu-yedhu-s4/",
    type: "show",
    imageUrl: "",
  },
];
const requestTimeoutMs = 20000;
const maxRetries = 3;

const cache = {
  shows: [],
  episodesByShow: {},
  updatedAt: null,
};

app.use(cors());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseDateValue = (value) => {
  if (!value) return 0;
  const text = String(value).trim();
  const dayMonthYear = text.match(/\b(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{2,4})\b/);
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = Number(dayMonthYear[2]);
    const yearRaw = Number(dayMonthYear[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const manualDate = new Date(year, month - 1, day).getTime();
    if (!Number.isNaN(manualDate)) return manualDate;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) return parsed;
  const cleaned = String(value)
    .replace(/[^\dA-Za-z\s:/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const retried = new Date(cleaned).getTime();
  if (!Number.isNaN(retried)) return retried;
  return 0;
};

const uniqueByUrl = (items) => {
  const map = new Map();
  items.forEach((item) => {
    if (item.url && !map.has(item.url)) map.set(item.url, item);
  });
  return Array.from(map.values());
};

const uniqueEpisodesByUrl = (items) => {
  const map = new Map();
  items.forEach((item) => {
    if (item.episodeUrl && !map.has(item.episodeUrl)) map.set(item.episodeUrl, item);
  });
  return Array.from(map.values());
};

const normalizeEpisode = (item) => ({
  title: String(item?.title || "Episode").replace(/\s+/g, " ").trim(),
  date: String(item?.date || "").replace(/\s+/g, " ").trim(),
  episodeUrl: String(item?.episodeUrl || "").trim(),
  dateValue: parseDateValue(item?.date || item?.title || ""),
});

const buildLatestEpisodeList = (items, hardLimit = 10) =>
  uniqueEpisodesByUrl(items.map(normalizeEpisode).filter((item) => item.episodeUrl && isTamilDhoolUrl(item.episodeUrl)))
    .map(({ title, date, episodeUrl, dateValue }) => ({ title, date, episodeUrl, dateValue }))
    .sort((a, b) => b.dateValue - a.dateValue)
    .slice(0, hardLimit);

const requestHtml = async (url) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await axios.get(url, {
        timeout: requestTimeoutMs,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        return response.data;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) await sleep(500 * attempt);
    }
  }

  const mirrorUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  try {
    const mirrorResponse = await axios.get(mirrorUrl, {
      timeout: requestTimeoutMs,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    return mirrorResponse.data;
  } catch (mirrorError) {
    const primaryMessage = lastError instanceof Error ? lastError.message : String(lastError);
    const mirrorMessage = mirrorError instanceof Error ? mirrorError.message : String(mirrorError);
    throw new Error(
      `Failed to fetch HTML from ${url}. Primary error: ${primaryMessage}. Mirror error: ${mirrorMessage}`,
    );
  }
};

const absoluteUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return new URL(url, baseUrl).toString();
};

const isTamilDhoolUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname.includes("tamildhool.tech");
  } catch (_error) {
    return false;
  }
};

const titleCase = (value) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

const normalizeShowName = (value) => {
  const cleaned = String(value)
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\b(vijay|tv|serial|show|episode|menu|home)\b/gi, " ")
    .replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return titleCase(cleaned);
};

const parseShowNameFromUrl = (url) => {
  const slug = (() => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const serialIndex = parts.findIndex((part) => part === "vijay-tv-serial" || part === "vijay-tv-show");
      return serialIndex >= 0 ? parts[serialIndex + 1] : "";
    } catch (_error) {
      return "";
    }
  })();
  if (!slug || /^page$/i.test(slug)) return "";
  return normalizeShowName(slug.replace(/-/g, " "));
};

const parseShowSlugFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const serialIndex = parts.findIndex((part) => part === "vijay-tv-serial" || part === "vijay-tv-show");
    return serialIndex >= 0 ? parts[serialIndex + 1] || "" : "";
  } catch (_error) {
    return "";
  }
};

const isValidShowCandidate = (name, url, slug) => {
  if (!name || name.length < 3) return false;
  if (!/\/vijay-tv\/vijay-tv-(serial|show)\/[^/]+\/?$/i.test(url)) return false;
  if (!slug || /^page$/i.test(slug)) return false;
  if (/(\d{2}-\d{2}-\d{4}|\d{4}|episode|promo|today|yesterday)/i.test(slug)) return false;
  if (/(vijay-tv-serial|vijay-tv-show|vijay-tv-programs|menu|home)/i.test(slug)) return false;
  if (/\b(menu|home|vijay tv serial|vijay tv show|vijay tv programs|sun tv|zee tamil|news|gossips)\b/i.test(name)) return false;
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(name)) return false;
  return true;
};


// Persistent image cache — each show URL is only fetched once per server lifetime
const imageCache = new Map();

// Fills item.imageUrl using the cache. Never throws — failures are silently ignored.
const fillShowImage = async (item) => {
  if (!item) return;
  if (item.imageUrl) {
    imageCache.set(item.url, item.imageUrl);
    return;
  }
  if (imageCache.has(item.url)) {
    item.imageUrl = imageCache.get(item.url) || "";
    return;
  }
  try {
    const pageHtml = await requestHtml(item.url);
    const $$ = cheerio.load(pageHtml);
    const metaImage =
      $$('meta[property="og:image"]').attr("content") ||
      $$('meta[name="og:image"]').attr("content") ||
      $$('meta[name="twitter:image"]').attr("content");
    const firstImg =
      $$("img.wp-post-image").attr("src") ||
      $$("article img").first().attr("src") ||
      $$("img").first().attr("src") ||
      $$("img").first().attr("data-src");
    let found = metaImage || firstImg || "";
    if (!found) {
      const mdMatch = (pageHtml || "").match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
      if (mdMatch && mdMatch[1]) found = mdMatch[1];
    }
    const resolved = found ? absoluteUrl(found) : "";
    imageCache.set(item.url, resolved);
    if (resolved) item.imageUrl = resolved;
  } catch (_e) {
    imageCache.set(item.url, ""); // don't retry next time
  }
};

// Returns the hardcoded shows/serials. Image fetches are best-effort and never cause a throw.
const getHardcodedShows = async () => {
  const shows = HARDCODED_SHOWS.map((s) => ({ ...s }));
  await Promise.allSettled(shows.map(fillShowImage));
  const serials = shows.filter((s) => s.type === "serial");
  const tvshows = shows.filter((s) => s.type === "show");
  return { serials, shows: tvshows };
};

// If strictOrder is true, always take episodes as they appear in the HTML (top to bottom)
const parseEpisodesFromShowPage = (html, showUrl, strictOrder = false) => {
  const $ = cheerio.load(html);
  const episodes = [];
  const showUrlObj = new URL(showUrl);
  const showPath = showUrlObj.pathname.replace(/\/+$/, "");

  $("a").each((_, element) => {
    const anchor = $(element);
    const href = absoluteUrl(anchor.attr("href") || "");
    if (!isTamilDhoolUrl(href)) return;
    if (!href.startsWith(`${baseUrl}${showPath}/`)) return;
    if (href === showUrl || /\/page\/\d+\/?$/i.test(href)) return;
    const titleRaw =
      anchor.attr("title") || anchor.find("img").attr("alt") || anchor.find("h2,h3,h4").first().text() || anchor.text();
    const title = titleRaw.replace(/\s+/g, " ").trim();
    if (!title || title.length < 5) return;
    const episodeLike =
      /episode|e\d+|serial|today|yesterday|promo|part/i.test(title) || /\/\d{4}\//.test(href) || /\d{1,2}[-/\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(title);
    if (!episodeLike) return;
    const dateFromTitleMatch = title.match(/(\d{1,2}[-/\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/\s]\d{2,4})/i);
    const nearbyDate = anchor
      .closest("article,li,div")
      .find("time,.date,.posted-on,.entry-date")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const dateText = dateFromTitleMatch?.[1] || nearbyDate || "";
    episodes.push({
      title,
      date: dateText,
      episodeUrl: href,
      dateValue: parseDateValue(dateText),
    });
  });

  let deduped = uniqueEpisodesByUrl(episodes);
  if (!deduped.length) {
    const markdownEpisodeRegex = /\[([^\]]+)\]\((https?:\/\/([^\)\s]+))\)/gi;
    const markdownEpisodes = [];
    let match = markdownEpisodeRegex.exec(html);
    while (match) {
      const title = match[1].replace(/\s+/g, " ").trim();
      const url = match[2].trim();
      if (/episode|serial|promo|today|yesterday|mahanadhi/i.test(title)) {
        markdownEpisodes.push({ title, date: "", episodeUrl: url, dateValue: parseDateValue(title) });
      }
      match = markdownEpisodeRegex.exec(html);
    }
    deduped.push(...uniqueEpisodesByUrl(markdownEpisodes));
  }

  if (!deduped.length) {
    const plainUrlRegex = /https?:\/\/(?:www\.)?tamildhool\.tech\/[^")\s']+/gi;
    const plainMatches = html.match(plainUrlRegex) || [];
    const plainEpisodes = plainMatches
      .map((value) => value.replace(/[),.]+$/, ""))
      .filter(
        (value) =>
          value.startsWith(`${baseUrl}${showPath}/`) &&
          !/\/page\/\d+\/?$/i.test(value) &&
          value !== showUrl &&
          value.includes("-"),
      )
      .map((url) => {
        const slug = url
          .replace(`${baseUrl}${showPath}/`, "")
          .replace(/\/$/, "")
          .split("/")
          .filter(Boolean)
          .pop();
        const cleanedSlug = slug ? slug.replace(/-vijay-tv-serial|-serial|-vijay-tv-show|-show/gi, "") : "";
        const title = cleanedSlug
          .split("-")
          .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : chunk))
          .join(" ");
        const dateMatch = cleanedSlug.match(/(\d{2})-(\d{2})-(\d{4})/);
        const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
        return { title: title || cleanedSlug || "Episode", date, episodeUrl: url, dateValue: parseDateValue(date) };
      });
    deduped.push(...uniqueEpisodesByUrl(plainEpisodes));
  }

  // If strictOrder, return the first 10 as they appear (top to bottom)
  if (strictOrder) {
    return buildLatestEpisodeList(deduped, 10).map(({ dateValue, ...rest }) => rest);
  }
  return buildLatestEpisodeList(deduped, 10).map(({ dateValue, ...rest }) => rest);
};

const parseVideoEmbedUrl = (html) => {
  const $ = cheerio.load(html);
  const iframeSrcs = [];
  
  $("iframe").each((_, element) => {
    const src = absoluteUrl($(element).attr("src") || "");
    if (src) {
      iframeSrcs.push(src);
    }
  });

  // Prioritize Vimeo (most reliable)
  const vimeoIframe = iframeSrcs.find((src) => src.includes("player.vimeo.com/video/"));
  if (vimeoIframe) {
    return vimeoIframe;
  }

  // Try other supported platforms
  const supportedIframe = iframeSrcs.find(
    (src) =>
      src.includes("dailymotion.com") ||
      src.includes("youtube.com") ||
      src.includes("youtu.be") ||
      src.includes("tamildhool.tech") ||
      src.includes("teamstoday.com") ||
      src.includes("jwplatform.com") ||
      src.includes("jwplayer.com"),
  );
  if (supportedIframe) {
    return supportedIframe;
  }

  // Fallback: search for embedded video IDs in HTML
  const vimeoIdMatch =
    html.match(/player\.vimeo\.com\/video\/(\d+)/i) ||
    html.match(/vimeo\.com\/(\d{6,})/i);
  if (vimeoIdMatch?.[1]) {
    return `https://player.vimeo.com/video/${vimeoIdMatch[1]}`;
  }

  const dailymotionMatch = html.match(
    /dailymotion\.com\/embed\/video\/([A-Za-z0-9]+)/i
  );
  if (dailymotionMatch?.[1]) {
    return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
  }

  const teamstodayLinks = Array.from(
    html.matchAll(
      /https?:\/\/(?:www\.)?teamstoday\.com\/\?video=([A-Za-z0-9]+)(#[A-Za-z0-9_-]+)?/gi
    )
  );
  if (teamstodayLinks.length) {
    const teamstodayVimeo = teamstodayLinks.find((match) =>
      (match[2] || "").toLowerCase().includes("vimeo")
    );
    const selectedTeamstoday = teamstodayVimeo || teamstodayLinks[0];
    const videoId = selectedTeamstoday?.[1] || "";
    const anchor = (selectedTeamstoday?.[2] || "").toLowerCase();
    if (/^\d+$/.test(videoId) || anchor.includes("vimeo")) {
      return `https://player.vimeo.com/video/${videoId}`;
    }
    return `https://www.dailymotion.com/embed/video/${videoId}`;
  }

  throw new Error("No playable embed URL found in episode page");
};

const sanitizeUrl = (value) => String(value || "").replace(/[<>"')\]]+$/g, "").trim();

const normalizePlayableVideoUrl = (value) => {
  const url = sanitizeUrl(value);
  if (!url) return "";
  const teamstodayMatch = url.match(/https?:\/\/(?:www\.)?teamstoday\.com\/?\?video=([A-Za-z0-9]+)(#[A-Za-z0-9_-]+)?/i);
  if (teamstodayMatch?.[1]) {
    // Keep teamstoday URL as-is; forcing embed conversion can break playback.
    return url;
  }
  const vimeoId = url.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,})/i)?.[1];
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}`;
  }
  const dmId = url.match(/dailymotion\.com\/(?:embed\/video\/|video\/)([A-Za-z0-9]+)/i)?.[1];
  if (dmId) {
    return `https://www.dailymotion.com/embed/video/${dmId}`;
  }
  const ytId =
    url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]+)/i)?.[1] ||
    url.match(/[?&]v=([A-Za-z0-9_-]+)/i)?.[1] ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]+)/i)?.[1];
  if (ytId) {
    return `https://www.youtube.com/embed/${ytId}`;
  }
  return url;
};

const isLikelyFinalPlayableUrl = (value) => {
  const url = sanitizeUrl(value);
  if (!url) return false;
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("player.vimeo.com") ||
      host.includes("dailymotion.com") ||
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("teamstoday.com") ||
      host.includes("jwplatform.com") ||
      host.includes("jwplayer.com")
    );
  } catch {
    return false;
  }
};

const inferSourceType = (value) => {
  const text = String(value || "").toLowerCase();
  if (/dailymotion/.test(text)) return "dailymotion";
  if (/vimeo/.test(text)) return "vimeo";
  if (/jw|jwplayer|jw player|jwplatform/.test(text)) return "jw";
  if (/youtube|youtu\.be/.test(text)) return "youtube";
  return "unknown";
};

const sourcePriority = {
  dailymotion: 0,
  vimeo: 1,
  jw: 2,
  youtube: 3,
  unknown: 4,
};

const parseEpisodeSourceLinks = (html, episodeUrl) => {
  const $ = cheerio.load(html);
  const found = [];

  $("a").each((_, element) => {
    const anchor = $(element);
    const href = absoluteUrl(anchor.attr("href") || "");
    if (!href || href === episodeUrl) return;
    const label = anchor.text().replace(/\s+/g, " ").trim();
    const title = String(anchor.attr("title") || "").trim();
    const combined = `${label} ${title} ${href}`;
    if (!/(source|dailymotion|vimeo|jw|jwplayer|youtube|watch|play|video)/i.test(combined)) {
      return;
    }
    found.push({
      type: inferSourceType(combined),
      label: label || title || href,
      url: href,
    });
  });

  const deduped = Array.from(
    new Map(found.map((item) => [item.url, item])).values(),
  ).sort((a, b) => sourcePriority[a.type] - sourcePriority[b.type]);

  return deduped;
};

const parseVideoEmbedUrlSafe = (html) => {
  try {
    return parseVideoEmbedUrl(html);
  } catch {
    return "";
  }
};

const collectVideoCandidateLinks = (html, basePageUrl) => {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a").each((_, element) => {
    const anchor = $(element);
    const href = absoluteUrl(anchor.attr("href") || "");
    const text = anchor.text().replace(/\s+/g, " ").trim().toLowerCase();
    if (!href) return;
    if (
      /dailymotion|youtube|vimeo|teamstoday|jwplayer|jw player|embed|video/i.test(href) ||
      /(source|watch|play|dailymotion|jw|player|video)/i.test(text)
    ) {
      links.add(href);
    }
  });

  $("iframe").each((_, element) => {
    const src = absoluteUrl($(element).attr("src") || "");
    if (src) links.add(src);
  });

  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const matches = html.match(urlRegex) || [];
  matches.forEach((rawUrl) => {
    const value = sanitizeUrl(rawUrl);
    if (
      /dailymotion|youtube|youtu\.be|vimeo|teamstoday|jwplayer|jwplatform|embed|player/i.test(value) ||
      /\.m3u8(\?|$)/i.test(value)
    ) {
      links.add(value);
    }
  });

  const fileMatchRegex = /file\s*:\s*["']([^"']+)["']/gi;
  let fileMatch = fileMatchRegex.exec(html);
  while (fileMatch) {
    links.add(absoluteUrl(fileMatch[1]));
    fileMatch = fileMatchRegex.exec(html);
  }

  const sourceMatchRegex = /sources?\s*:\s*\[\s*\{[^}]*file\s*:\s*["']([^"']+)["']/gi;
  let sourceMatch = sourceMatchRegex.exec(html);
  while (sourceMatch) {
    links.add(absoluteUrl(sourceMatch[1]));
    sourceMatch = sourceMatchRegex.exec(html);
  }

  if (basePageUrl) {
    const base = basePageUrl.replace(/\/+$/, "");
    links.add(base);
  }

  return Array.from(links).map((value) => normalizePlayableVideoUrl(value)).filter(Boolean);
};

const resolvePlayableVideoUrl = async (episodeUrl) => {
  const episodeHtml = await requestHtml(episodeUrl);
  const sourceLinks = parseEpisodeSourceLinks(episodeHtml, episodeUrl);
  const explicitTeamstoday = sourceLinks.find((item) => /teamstoday\.com/i.test(item.url));
  if (explicitTeamstoday?.url) {
    return normalizePlayableVideoUrl(explicitTeamstoday.url);
  }
  const entryPoints = sourceLinks.length ? sourceLinks.map((item) => item.url) : [episodeUrl];

  for (const sourceUrl of entryPoints) {
    const resolved = await resolvePlayableFromEntry(sourceUrl);
    if (resolved) {
      return resolved;
    }
  }

  throw new Error("No playable video source could be resolved from episode page");
};

const resolvePlayableFromEntry = async (entryUrl) => {
  const queue = [{ url: entryUrl, depth: 0 }];
  const visited = new Set();
  const maxDepth = 4;

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const currentUrl = normalizePlayableVideoUrl(current.url);
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    if (isLikelyFinalPlayableUrl(currentUrl)) {
      return currentUrl;
    }
    if (current.depth > maxDepth) {
      continue;
    }

    let html = "";
    try {
      html = await requestHtml(currentUrl);
    } catch {
      continue;
    }

    const direct = normalizePlayableVideoUrl(parseVideoEmbedUrlSafe(html));
    if (direct && isLikelyFinalPlayableUrl(direct)) {
      return direct;
    }

    const nextCandidates = collectVideoCandidateLinks(html, currentUrl);
    for (const candidate of nextCandidates) {
      if (!candidate || visited.has(candidate)) continue;
      if (isLikelyFinalPlayableUrl(candidate)) {
        return candidate;
      }
      queue.push({ url: candidate, depth: current.depth + 1 });
    }
  }

  return "";
};

const extractEpisodesFromRawLinks = (html, showUrl) => {
  const showPath = new URL(showUrl).pathname.replace(/\/+$/, "");
  const linkRegex = new RegExp(`https?:\\/\\/(?:www\\.)?tamildhool\\.tech${showPath}\\/[^\\"'\\s)]+`, "gi");
  const matches = html.match(linkRegex) || [];
  const links = Array.from(new Set(matches.map((value) => value.replace(/[),.]+$/, ""))));
  return links
    .filter((url) => !/\/page\/\d+\/?$/i.test(url))
    .map((episodeUrl) => {
      const slug = episodeUrl
        .replace(new RegExp(`https?:\\/\\/(?:www\\.)?tamildhool\\.tech${showPath}\\/`, "i"), "")
        .replace(/\/$/, "");
      const cleanSlug = slug.replace(/-vijay-tv-serial|-serial|-vijay-tv-show|-show/gi, "");
      const dateMatch = cleanSlug.match(/(\d{2})-(\d{2})-(\d{4})/);
      const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
      const title = cleanSlug
        .split("-")
        .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : chunk))
        .join(" ")
        .trim();
      return { title: title || cleanSlug || "Episode", date, episodeUrl, dateValue: parseDateValue(date) };
    });
};

const fetchShows = async () => {
  const { serials, shows } = await getHardcodedShows();
  const combined = [...serials, ...shows];
  const deduped = uniqueByUrl(combined);
  const mahanadhiIndex = deduped.findIndex((show) => show.name.toLowerCase() === "mahanadhi");
  if (mahanadhiIndex === -1) {
    const mahanadhiFallback = {
      name: "Mahanadhi",
      url: `${baseUrl}/vijay-tv/vijay-tv-serial/mahanadhi/`,
      imageUrl: "https://www.tamildhool.tech/wp-content/uploads/2025/07/maha.jpg",
    };
    deduped.unshift(mahanadhiFallback);
  } else if (mahanadhiIndex > 0) {
    const [mahanadhiShow] = deduped.splice(mahanadhiIndex, 1);
    deduped.unshift(mahanadhiShow);
  }
  if (!deduped.length) {
    if (cache.shows.length) return cache.shows;
    throw new Error("No shows were parsed from Vijay TV pages");
  }
  cache.shows = deduped.slice(0, 6);
  cache.updatedAt = Date.now();
  return cache.shows;
};


// Only return the hardcoded shows/serials
app.get("/shows/all", async (_req, res) => {
  try {
    const { serials, shows } = await getHardcodedShows();
    res.json({ provider: "Vijay TV", serials, shows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load shows: ${message}` });
  }
});

const findShowByName = (showName, shows) => {
  if (!showName || !Array.isArray(shows)) return undefined;
  const target = normalizeShowName(showName).toLowerCase();
  // Exact normalized match
  const exact = shows.find((show) => normalizeShowName(show.name).toLowerCase() === target);
  if (exact) return exact;
  // Partial match: show contains target or target contains show
  const partial = shows.find((show) => {
    const s = normalizeShowName(show.name).toLowerCase();
    return s.includes(target) || target.includes(s) || show.name.toLowerCase().includes(showName.toLowerCase());
  });
  if (partial) return partial;
  return undefined;
};


// Only fetch episodes for the hardcoded shows/serials
const fetchEpisodes = async (showUrl, limit, offset) => {
  if (!showUrl) throw new Error("Query parameter 'show' is required");
  const shows = HARDCODED_SHOWS;
  const selectedShow = shows.find((s) => s.url === showUrl || showUrl.includes(s.url));
  if (!selectedShow) throw new Error(`Show '${showUrl}' is not in the allowed list`);

  // Only fetch the first page (no pagination)
  try {
    const html = await requestHtml(selectedShow.url);
    let episodes = parseEpisodesFromShowPage(html, selectedShow.url, true);

    // Fallback: keep same-page extraction only and then sort by parsed date.
    if (episodes.length < 10) {
      const extra = extractEpisodesFromRawLinks(html, selectedShow.url);
      const seen = new Set(episodes.map((e) => e.episodeUrl));
      for (const ep of extra) {
        if (!seen.has(ep.episodeUrl)) {
          episodes.push(ep);
          seen.add(ep.episodeUrl);
        }
      }
    }

    episodes = buildLatestEpisodeList(episodes, 10).map(({ dateValue, ...rest }) => rest);
    if (!episodes.length) throw new Error(`No episodes were parsed for '${selectedShow.name}'`);
    return episodes.slice(offset, offset + limit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch episodes for '${selectedShow.name}': ${message}`);
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, updatedAt: cache.updatedAt });
});

app.get("/shows", async (_req, res) => {
  try {
    const shows = await fetchShows();
    res.json({ provider: "Vijay TV", shows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load shows: ${message}` });
  }
});

app.get("/episodes", async (req, res) => {
  try {
    const show = String(req.query.show || "");
    const limitRaw = Number(req.query.limit || 20);
    const offsetRaw = Number(req.query.offset || 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 20) : 20;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;
    const episodes = await fetchEpisodes(show, limit, offset);
    res.json({ show, episodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load episodes: ${message}` });
  }
});

app.get("/video", async (req, res) => {
  try {
    const episodeUrl = String(req.query.episodeUrl || "");
    if (!episodeUrl) {
      throw new Error("Query parameter 'episodeUrl' is required");
    }
    // Use the full multi-hop resolver so teamstoday/Vimeo/Dailymotion redirects are followed
    const videoUrl = await resolvePlayableVideoUrl(episodeUrl);
    if (!videoUrl) {
      throw new Error("No playable video source could be resolved from episode page");
    }
    const autoplayUrl = videoUrl.includes("?")
      ? `${videoUrl}&autoplay=1&muted=0`
      : `${videoUrl}?autoplay=1&muted=0`;
    res.json({ videoUrl: autoplayUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load video URL: ${message}` });
  }
});

app.get("/embed", (req, res) => {
  try {
    const src = String(req.query.src || "");
    if (!src) {
      return res.status(400).send("Missing src parameter");
    }
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Player</title>
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; width: 100%; overflow: hidden; }
      iframe { position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; }
    </style>
  </head>
  <body>
    <iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </body>
</html>`;
    res.type("text/html").send(html);
  } catch (error) {
    res.status(500).send("Embed error");
  }
});

// Debug endpoint to inspect what requestHtml returns for master page
app.get("/debug/rawmaster", async (_req, res) => {
  try {
    const debugUrl = HARDCODED_SHOWS[0]?.url;
    if (!debugUrl) {
      throw new Error("No hardcoded show URL available");
    }
    const html = await requestHtml(debugUrl);
    res.type("text/plain").send(String(html).slice(0, 200000));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error fetching master page: ${message}`);
  }
});

// Fetch a single show's image URL (tries og:image, first image, or markdown image)
app.get("/show-image", async (req, res) => {
  try {
    const showUrl = String(req.query.showUrl || "");
    if (!showUrl) return res.status(400).json({ error: "Query parameter 'showUrl' is required" });
    const html = await requestHtml(showUrl);
    // Try HTML meta tags and common image locations
    const $ = cheerio.load(html);
    let image = $("meta[property='og:image']").attr("content") || $("meta[name='og:image']").attr("content") || $("meta[name='twitter:image']").attr("content") || $("img.wp-post-image").attr("src") || $("article img").first().attr("src") || $("img").first().attr("src") || "";
    if (!image) {
      const mdMatch = String(html).match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
      if (mdMatch) image = mdMatch[1];
    }
    const imageUrl = image ? absoluteUrl(image) : "";
    res.json({ imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to fetch show image: ${message}` });
  }
});

app.listen(port, () => {
  console.log(`TV streaming backend running on port ${port}`);
});