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
  } catch (error) {
    throw new Error(`Failed to parse cache key '${key}': ${String(error)}`);
  }
};

export const cacheShows = async (shows: Show[]): Promise<void> => {
  await write(SHOWS_KEY, shows);
};

export const getCachedShows = async (): Promise<Show[] | null> => read<Show[]>(SHOWS_KEY);

export const cacheEpisodes = async (showName: string, episodes: Episode[]): Promise<void> => {
  await write(`${EPISODES_KEY_PREFIX}${showName.toLowerCase()}`, episodes);
};

export const getCachedEpisodes = async (showName: string): Promise<Episode[] | null> =>
  read<Episode[]>(`${EPISODES_KEY_PREFIX}${showName.toLowerCase()}`);

export const cacheBackendHost = async (host: string): Promise<void> => {
  await write(BACKEND_HOST_KEY, host);
};

export const getCachedBackendHost = async (): Promise<string | null> => read<string>(BACKEND_HOST_KEY);
