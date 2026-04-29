import AsyncStorage from "@react-native-async-storage/async-storage";
import { Episode, Show } from "../types";

const SHOWS_KEY = "cache:shows:vijay";
const EPISODES_KEY_PREFIX = "cache:episodes:";
const BACKEND_HOST_KEY = "cache:backend-host";

const write = async <T>(key: string, value: T): Promise<void> => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

const read = async <T>(key: string): Promise<T | null> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const isShow = (value: unknown): value is Show => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const show = value as Show;
  return isNonEmptyString(show.name) && isNonEmptyString(show.url);
};

const isEpisode = (value: unknown): value is Episode => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const episode = value as Episode;
  return isNonEmptyString(episode.title) && isNonEmptyString(episode.episodeUrl);
};

export const cacheShows = async (shows: Show[]): Promise<void> => {
  await write(SHOWS_KEY, shows);
};

export const getCachedShows = async (): Promise<Show[] | null> => {
  const value = await read<unknown>(SHOWS_KEY);
  if (!Array.isArray(value)) {
    if (value !== null) {
      await AsyncStorage.removeItem(SHOWS_KEY);
    }
    return null;
  }
  const cleaned = value.filter(isShow);
  if (!cleaned.length) {
    await AsyncStorage.removeItem(SHOWS_KEY);
    return null;
  }
  return cleaned;
};

export const cacheEpisodes = async (showName: string, episodes: Episode[]): Promise<void> => {
  await write(`${EPISODES_KEY_PREFIX}${showName.toLowerCase()}`, episodes);
};

export const getCachedEpisodes = async (showName: string): Promise<Episode[] | null> => {
  const key = `${EPISODES_KEY_PREFIX}${showName.toLowerCase()}`;
  const value = await read<unknown>(key);
  if (!Array.isArray(value)) {
    if (value !== null) {
      await AsyncStorage.removeItem(key);
    }
    return null;
  }
  const cleaned = value.filter(isEpisode);
  if (!cleaned.length) {
    await AsyncStorage.removeItem(key);
    return null;
  }
  return cleaned;
};

export const cacheBackendHost = async (host: string): Promise<void> => {
  await write(BACKEND_HOST_KEY, host);
};

export const getCachedBackendHost = async (): Promise<string | null> => {
  const value = await read<unknown>(BACKEND_HOST_KEY);
  if (typeof value !== "string" || !value.trim()) {
    if (value !== null) {
      await AsyncStorage.removeItem(BACKEND_HOST_KEY);
    }
    return null;
  }
  return value;
};
