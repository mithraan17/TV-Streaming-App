import axios, { AxiosInstance } from "axios";
import * as Network from "expo-network";
import { API_BASE_URL, BACKEND_PORT, DISCOVERY_TIMEOUT_MS } from "../constants";
import { Episode, Show } from "../types";

const createClient = (baseURL: string): AxiosInstance =>
  axios.create({
    baseURL,
    timeout: 20000,
  });

let resolvedBaseUrl: string | null = null;

type ShowsResponse = {
  provider: string;
  shows: Show[];
};

type EpisodesResponse = {
  show: string;
  episodes: Episode[];
};

type VideoResponse = {
  videoUrl: string;
};

const buildBaseUrl = (host: string): string => `http://${host}:${BACKEND_PORT}`;

const extractSubnetPrefix = (ipAddress: string): string => {
  const parts = ipAddress.split(".");
  if (parts.length !== 4) {
    return "";
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
};

const checkHealth = async (baseURL: string): Promise<boolean> => {
  try {
    const response = await axios.get<{ ok: boolean }>("/health", {
      baseURL,
      timeout: DISCOVERY_TIMEOUT_MS,
    });
    return response.status === 200 && response.data.ok === true;
  } catch (_error) {
    return false;
  }
};

const discoverHostsFromSubnet = async (subnetPrefix: string): Promise<string | null> => {
  if (!subnetPrefix) {
    return null;
  }
  for (let start = 1; start <= 250; start += 25) {
    const checks: Promise<string | null>[] = [];
    for (let offset = 0; offset < 25 && start + offset <= 254; offset += 1) {
      const host = `${subnetPrefix}.${start + offset}`;
      checks.push(
        (async () => {
          const ok = await checkHealth(buildBaseUrl(host));
          return ok ? host : null;
        })(),
      );
    }
    const results = await Promise.all(checks);
    const found = results.find((value) => value);
    if (found) {
      return found;
    }
  }
  return null;
};

const resolveBackendBaseUrl = async (): Promise<string> => {
  if (resolvedBaseUrl) {
    return resolvedBaseUrl;
  }

  if (await checkHealth(API_BASE_URL)) {
    resolvedBaseUrl = API_BASE_URL;
    return resolvedBaseUrl;
  }

  const localIpAddress = await Network.getIpAddressAsync();
  const subnetPrefix = extractSubnetPrefix(localIpAddress);
  const discoveredHost = await discoverHostsFromSubnet(subnetPrefix);
  if (discoveredHost) {
    const baseURL = buildBaseUrl(discoveredHost);
    resolvedBaseUrl = baseURL;
    return baseURL;
  }

  throw new Error("Backend server was not found on the local network");
};

const withClient = async <T>(callback: (client: AxiosInstance) => Promise<T>): Promise<T> => {
  const baseURL = await resolveBackendBaseUrl();
  const client = createClient(baseURL);
  try {
    return await callback(client);
  } catch (error) {
    resolvedBaseUrl = null;
    throw error;
  }
};

export const fetchShows = async (): Promise<Show[]> => {
  const response = await withClient((client) => client.get<ShowsResponse>("/shows"));
  if (!Array.isArray(response.data.shows)) {
    throw new Error("Invalid shows response");
  }
  return response.data.shows.slice(0, 6);
};

export const fetchAllShows = async (): Promise<{ serials: Show[]; shows: Show[] }> => {
  const response = await withClient((client) =>
    client.get<{ provider: string; serials: Show[]; shows: Show[] }>("/shows/all"),
  );
  if (!Array.isArray(response.data.serials) || !Array.isArray(response.data.shows)) {
    throw new Error("Invalid shows/all response");
  }
  return { serials: response.data.serials, shows: response.data.shows };
};

export const fetchEpisodes = async (showName: string, limit: number, offset: number): Promise<Episode[]> => {
  const response = await withClient((client) =>
    client.get<EpisodesResponse>("/episodes", {
      params: { show: showName, limit, offset },
    }),
  );
  if (!Array.isArray(response.data.episodes)) {
    throw new Error("Invalid episodes response");
  }
  return response.data.episodes;
};

export const fetchVideoUrl = async (episodeUrl: string): Promise<string> => {
  const response = await withClient((client) =>
    client.get<VideoResponse>("/video", {
      params: { episodeUrl },
    }),
  );
  const videoUrl = response.data.videoUrl;
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
    throw new Error("Invalid video URL");
  }
  return videoUrl;
};

export const fetchShowImage = async (showUrl: string): Promise<string> => {
  const response = await withClient((client) => client.get<{ imageUrl: string }>("/show-image", { params: { showUrl } }));
  return response.data.imageUrl || "";
};
