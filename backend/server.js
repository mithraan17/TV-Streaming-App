import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const baseUrl = "https://www.tamildhool.tech";
const vijaySerialsUrl = `${baseUrl}/vijay-tv/vijay-tv-serial/`;
const requestTimeoutMs = 20000;
const maxRetries = 3;

const cache = {
  shows: [],
  episodesByShow: {},
  updatedAt: null,
};

app.use(cors());

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseDateValue = (value) => {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const cleaned = value.replace(/[^\dA-Za-z\s:/-]/g, " ").replace(/\s+/g, " ").trim();
  const retried = new Date(cleaned).getTime();
  if (!Number.isNaN(retried)) {
    return retried;
  }
  return 0;
};

const uniqueByUrl = (items) => {
  const map = new Map();
  items.forEach((item) => {
    if (item.url && !map.has(item.url)) {
      map.set(item.url, item);
    }
  });
  return Array.from(map.values());
};

const uniqueEpisodesByUrl = (items) => {
  const map = new Map();
  items.forEach((item) => {
    if (item.episodeUrl && !map.has(item.episodeUrl)) {
      map.set(item.episodeUrl, item);
    }
  });
  return Array.from(map.values());
};

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
      if (attempt < maxRetries) {
        await sleep(500 * attempt);
      }
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
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
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
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\b(vijay|tv|serial|show|episode|menu|home)\b/gi, " ")
    .replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  return titleCase(cleaned);
};

const parseShowNameFromUrl = (url) => {
  const slug = (() => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const serialIndex = parts.findIndex((part) => part === "vijay-tv-serial");
      return serialIndex >= 0 ? parts[serialIndex + 1] : "";
    } catch (_error) {
      return "";
    }
  })();
  if (!slug || /^page$/i.test(slug)) {
    return "";
  }
  return normalizeShowName(slug.replace(/-/g, " "));
};

const parseShowSlugFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const serialIndex = parts.findIndex((part) => part === "vijay-tv-serial");
    return serialIndex >= 0 ? parts[serialIndex + 1] || "" : "";
  } catch (_error) {
    return "";
  }
};

const isValidShowCandidate = (name, url, slug) => {
  if (!name || name.length < 3) {
    return false;
  }
  if (!/\/vijay-tv\/vijay-tv-serial\/[^/]+\/?$/i.test(url)) {
    return false;
  }
  if (!slug || /^page$/i.test(slug)) {
    return false;
  }
  if (/(\d{2}-\d{2}-\d{4}|\d{4}|episode|promo|today|yesterday)/i.test(slug)) {
    return false;
  }
  if (/(vijay-tv-serial|vijay-tv-show|vijay-tv-programs|menu|home)/i.test(slug)) {
    return false;
  }
  if (
    /\b(menu|home|vijay tv serial|vijay tv show|vijay tv programs|sun tv|zee tamil|news|gossips)\b/i.test(name)
  ) {
    return false;
  }
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(name)) {
    return false;
  }
  return true;
};

const parseShowCards = (html) => {
  const $ = cheerio.load(html);
  const candidates = [];
  const imageBySlug = new Map();

  const markdownImageLinkRegex =
    /\[!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)\]\((https?:\/\/(?:www\.)?tamildhool\.tech\/vijay-tv\/vijay-tv-serial\/[^\s)]+)(?:\s+"[^"]*")?\)/gi;
  let imageMatch = markdownImageLinkRegex.exec(html);
  while (imageMatch) {
    const imageUrl = absoluteUrl(imageMatch[1].trim());
    const linkedUrl = imageMatch[2].trim();
    const slug = parseShowSlugFromUrl(linkedUrl);
    if (slug && imageUrl) {
      imageBySlug.set(slug.toLowerCase(), imageUrl);
    }
    imageMatch = markdownImageLinkRegex.exec(html);
  }

  $("a").each((_, element) => {
    const anchor = $(element);
    const hrefRaw = anchor.attr("href") || "";
    const href = absoluteUrl(hrefRaw);
    if (!href.includes("/vijay-tv/vijay-tv-serial/")) {
      return;
    }
    const title = normalizeShowName(
      anchor.find("img").attr("alt") ||
      anchor.attr("title") ||
      anchor.closest("article,li,div").find("h2,h3,h4,em,strong").first().text() ||
      anchor.text(),
    );
    const fallbackFromUrl = parseShowNameFromUrl(href);
    const slug = parseShowSlugFromUrl(href);
    const finalName = title || fallbackFromUrl;
    if (!isValidShowCandidate(finalName, href, slug)) {
      return;
    }
    const foundImage = absoluteUrl(anchor.find("img").attr("src") || anchor.find("img").attr("data-src") || "");
    const imageUrl = foundImage || (slug ? imageBySlug.get(slug.toLowerCase()) || "" : "");
    candidates.push({
      name: finalName,
      url: href,
      imageUrl,
    });
  });

  const deduped = uniqueByUrl(candidates)
    .filter((item) => item.name.length > 1)
    .slice(0, 20);

  if (!deduped.length) {
    const markdownLinkRegex =
      /\[([^\]]+)\]\((https?:\/\/(?:www\.)?tamildhool\.tech\/vijay-tv\/vijay-tv-serial\/[^)\s]+)\)/gi;
    const markdownCandidates = [];
    imageBySlug.forEach((imageUrl, slugLower) => {
      const showUrl = `${baseUrl}/vijay-tv/vijay-tv-serial/${slugLower}/`;
      const name = parseShowNameFromUrl(showUrl);
      const slug = slugLower;
      if (isValidShowCandidate(name, showUrl, slug)) {
        markdownCandidates.push({ name, url: showUrl, imageUrl });
      }
    });
    let match = markdownLinkRegex.exec(html);
    while (match) {
      const name = normalizeShowName(match[1].trim()) || parseShowNameFromUrl(match[2].trim());
      const slug = parseShowSlugFromUrl(match[2].trim());
      if (!isValidShowCandidate(name, match[2].trim(), slug)) {
        match = markdownLinkRegex.exec(html);
        continue;
      }
      markdownCandidates.push({
        name,
        url: match[2].trim(),
        imageUrl: "",
      });
      match = markdownLinkRegex.exec(html);
    }
    deduped.push(...uniqueByUrl(markdownCandidates));
  }

  const mahanadhiIndex = deduped.findIndex((item) => item.name.toLowerCase().includes("mahanadhi"));
  if (mahanadhiIndex > 0) {
    const mahanadhi = deduped[mahanadhiIndex];
    deduped.splice(mahanadhiIndex, 1);
    deduped.unshift(mahanadhi);
  }

  return deduped.slice(0, 6);
};

const parseEpisodesFromShowPage = (html, showUrl) => {
  const $ = cheerio.load(html);
  const episodes = [];
  const showUrlObj = new URL(showUrl);
  const showPath = showUrlObj.pathname.replace(/\/+$/, "");

  $("a").each((_, element) => {
    const anchor = $(element);
    const href = absoluteUrl(anchor.attr("href") || "");
    if (!isTamilDhoolUrl(href)) {
      return;
    }
    const titleRaw =
      anchor.attr("title") ||
      anchor.find("img").attr("alt") ||
      anchor.find("h2,h3,h4").first().text() ||
      anchor.text();
    const title = titleRaw.replace(/\s+/g, " ").trim();
    if (!title || title.length < 5) {
      return;
    }
    const episodeLike =
      /episode|e\d+|serial|today|yesterday|promo|part/i.test(title) ||
      /\/\d{4}\//.test(href) ||
      /\d{1,2}[-/\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(title);
    if (!episodeLike) {
      return;
    }
    const dateFromTitleMatch = title.match(
      /(\d{1,2}[-/\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/\s]\d{2,4})/i,
    );
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

  const deduped = uniqueByUrl(episodes);
  if (!deduped.length) {
    const markdownEpisodeRegex = /\[([^\]]+)\]\((https?:\/\/(?:www\.)?tamildhool\.tech\/[^)\s]+)\)/gi;
    const markdownEpisodes = [];
    let match = markdownEpisodeRegex.exec(html);
    while (match) {
      const title = match[1].replace(/\s+/g, " ").trim();
      const url = match[2].trim();
      if (/episode|serial|promo|today|yesterday|mahanadhi/i.test(title)) {
        markdownEpisodes.push({
          title,
          date: "",
          episodeUrl: url,
          dateValue: parseDateValue(title),
        });
      }
      match = markdownEpisodeRegex.exec(html);
    }
    deduped.push(...uniqueByUrl(markdownEpisodes));
  }
  if (!deduped.length) {
    const plainUrlRegex = /https?:\/\/(?:www\.)?tamildhool\.tech\/[^\s)"']+/gi;
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
        const cleanedSlug = slug ? slug.replace(/-vijay-tv-serial|-serial/gi, "") : "";
        const title = cleanedSlug
          .split("-")
          .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : chunk))
          .join(" ");
        const dateMatch = cleanedSlug.match(/(\d{2})-(\d{2})-(\d{4})/);
        const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
        return {
          title: title || cleanedSlug || "Episode",
          date,
          episodeUrl: url,
          dateValue: parseDateValue(date),
        };
      });
    deduped.push(...uniqueByUrl(plainEpisodes));
  }
  deduped.sort((a, b) => b.dateValue - a.dateValue);
  return deduped.slice(0, 20).map(({ dateValue, ...rest }) => rest);
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

  const vimeoIframe = iframeSrcs.find((src) => src.includes("player.vimeo.com/video/"));
  if (vimeoIframe) {
    return vimeoIframe;
  }

  const supportedIframe = iframeSrcs.find(
    (src) => src.includes("dailymotion.com") || src.includes("youtube.com") || src.includes("tamildhool.tech"),
  );
  if (supportedIframe) {
    return supportedIframe;
  }

  const vimeoIdMatch = html.match(/player\.vimeo\.com\/video\/(\d+)/i) || html.match(/vimeo\.com\/(\d{6,})/i);
  if (vimeoIdMatch?.[1]) {
    return `https://player.vimeo.com/video/${vimeoIdMatch[1]}`;
  }

  const dailymotionMatch = html.match(/dailymotion\.com\/embed\/video\/([A-Za-z0-9]+)/i);
  if (dailymotionMatch?.[1]) {
    return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
  }

  const teamstodayLinks = Array.from(
    html.matchAll(/https?:\/\/(?:www\.)?teamstoday\.com\/\?video=([A-Za-z0-9]+)(#[A-Za-z0-9_-]+)?/gi),
  );
  if (teamstodayLinks.length) {
    const teamstodayVimeo = teamstodayLinks.find((match) => (match[2] || "").toLowerCase().includes("vimeo"));
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
      const cleanSlug = slug.replace(/-vijay-tv-serial|-serial/gi, "");
      const dateMatch = cleanSlug.match(/(\d{2})-(\d{2})-(\d{4})/);
      const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
      const title = cleanSlug
        .split("-")
        .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : chunk))
        .join(" ")
        .trim();
      return {
        title: title || "Episode",
        date,
        episodeUrl,
        dateValue: parseDateValue(date),
      };
    });
};

const fetchShows = async () => {
  const html = await requestHtml(vijaySerialsUrl);
  const parsedShows = parseShowCards(html);
  const mahanadhiFallback = {
    name: "Mahanadhi",
    url: `${baseUrl}/vijay-tv/vijay-tv-serial/mahanadhi/`,
    imageUrl: "https://www.tamildhool.tech/wp-content/uploads/2025/07/maha.jpg",
  };
  const shows = [...parsedShows];
  const mahanadhiIndex = shows.findIndex((show) => show.name.toLowerCase() === "mahanadhi");
  if (mahanadhiIndex === -1) {
    shows.unshift(mahanadhiFallback);
  } else if (mahanadhiIndex > 0) {
    const [mahanadhiShow] = shows.splice(mahanadhiIndex, 1);
    shows.unshift(mahanadhiShow);
  }
  if (!shows.length) {
    if (cache.shows.length) {
      return cache.shows;
    }
    throw new Error("No shows were parsed from Vijay TV serial page");
  }
  cache.shows = uniqueByUrl(shows).slice(0, 6);
  cache.updatedAt = Date.now();
  return cache.shows;
};

const findShowByName = (showName, shows) =>
  shows.find((show) => show.name.toLowerCase() === showName.toLowerCase()) ||
  shows.find((show) => show.name.toLowerCase().includes(showName.toLowerCase()));

const fetchEpisodes = async (showName, limit, offset) => {
  if (!showName) {
    throw new Error("Query parameter 'show' is required");
  }

  const shows = cache.shows.length ? cache.shows : await fetchShows();
  const selectedShow = findShowByName(showName, shows);

  if (!selectedShow) {
    if (cache.episodesByShow[showName]) {
      return cache.episodesByShow[showName].slice(offset, offset + limit);
    }
    throw new Error(`Show '${showName}' was not found`);
  }

  const pageUrls = [selectedShow.url];
  for (let page = 2; page <= 4; page += 1) {
    pageUrls.push(`${selectedShow.url.replace(/\/$/, "")}/page/${page}/`);
  }

  const allEpisodes = [];
  for (const pageUrl of pageUrls) {
    try {
      const html = await requestHtml(pageUrl);
      const episodesFromPage = parseEpisodesFromShowPage(html, selectedShow.url);
      const episodesFromRawLinks = extractEpisodesFromRawLinks(html, selectedShow.url);
      allEpisodes.push(...episodesFromPage);
      allEpisodes.push(...episodesFromRawLinks);
      if (allEpisodes.length >= 20) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Episode page fetch failed", { pageUrl, message });
    }
  }

  const episodes = uniqueEpisodesByUrl(
    allEpisodes.map((episode) => ({
      ...episode,
      dateValue: parseDateValue(episode.date),
    })),
  )
    .sort((a, b) => b.dateValue - a.dateValue)
    .slice(0, 20)
    .map(({ dateValue, ...rest }) => rest);
  if (!episodes.length) {
    if (cache.episodesByShow[showName]) {
      return cache.episodesByShow[showName];
    }
    throw new Error(`No episodes were parsed for '${showName}'`);
  }

  cache.episodesByShow[selectedShow.name] = episodes;
  cache.episodesByShow[showName] = episodes;
  cache.updatedAt = Date.now();
  return episodes.slice(offset, offset + limit);
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
    const html = await requestHtml(episodeUrl);
    const videoUrl = parseVideoEmbedUrl(html);
    const autoplayUrl = videoUrl.includes("?")
      ? `${videoUrl}&autoplay=1&muted=0`
      : `${videoUrl}?autoplay=1&muted=0`;
    res.json({ videoUrl: autoplayUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load video URL: ${message}` });
  }
});

app.listen(port, () => {
  console.log(`TV streaming backend running on port ${port}`);
});
