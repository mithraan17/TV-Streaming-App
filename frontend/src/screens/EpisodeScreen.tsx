import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fetchEpisodes, fetchVideoUrl } from "../services/api";
import { cacheEpisodes, getCachedEpisodes } from "../services/cache";
import { Episode, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Episode">;
type TVPressableState = { pressed: boolean; focused?: boolean };
type EpisodeTile = Episode & { kind: "episode" };
type LoadMoreTile = { kind: "loadMore"; id: string };
type EpisodeListItem = EpisodeTile | LoadMoreTile;
const FIRST_BATCH_SIZE = 5;
const SECOND_BATCH_SIZE = 10;
const TOTAL_EPISODES_CAP = FIRST_BATCH_SIZE + SECOND_BATCH_SIZE;

const parseDate = (value: string): number => {
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  return 0;
};

const EpisodeCard = ({
  episode,
  onPress,
  preferredFocus,
  isFocused,
  onFocus,
}: {
  episode: Episode;
  onPress: (episode: Episode) => void;
  preferredFocus: boolean;
  isFocused: boolean;
  onFocus: (episodeUrl: string) => void;
}) => (
  <Pressable
    onPress={() => onPress(episode)}
    onFocus={() => onFocus(episode.episodeUrl)}
    hasTVPreferredFocus={preferredFocus}
    style={(state) => [styles.card, (((state as TVPressableState).focused ?? false) || isFocused) && styles.cardFocused]}
  >
    <View style={styles.cardGlow} />
    <Text style={styles.cardTitle} numberOfLines={3}>
      {episode.title}
    </Text>
    <Text style={styles.cardDate}>{episode.date || "Unknown date"}</Text>
  </Pressable>
);

const LoadMoreCard = ({
  onPress,
  isFocused,
  onFocus,
}: {
  onPress: () => void;
  isFocused: boolean;
  onFocus: () => void;
}) => (
  <Pressable onPress={onPress} onFocus={onFocus} style={(state) => [styles.card, styles.loadMoreCard, (((state as TVPressableState).focused ?? false) || isFocused) && styles.cardFocused]}>
    <Text style={styles.loadMoreTitle}>Load More</Text>
    <Text style={styles.loadMoreText}>Fetch 10 more episodes</Text>
  </Pressable>
);

export const EpisodeScreen = ({ route, navigation }: Props) => {
  const { provider, show } = route.params;
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [prefetchedEpisodes, setPrefetchedEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolvingVideo, setResolvingVideo] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(FIRST_BATCH_SIZE);
  const [focusedItemId, setFocusedItemId] = useState<string>("");

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      navigation.goBack();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [navigation]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const cached = await getCachedEpisodes(show.name);
        if (cached?.length && active) {
          const sortedCached = [...cached]
            .sort((a, b) => parseDate(b.date) - parseDate(a.date))
            .filter((episode, index, list) => list.findIndex((item) => item.episodeUrl === episode.episodeUrl) === index)
            .slice(0, TOTAL_EPISODES_CAP);
          setEpisodes(sortedCached);
          setFocusedItemId(sortedCached[0]?.episodeUrl || "");
          setVisibleCount(FIRST_BATCH_SIZE);
          setLoading(false);
        }
        const firstBatch = await fetchEpisodes(show.name, FIRST_BATCH_SIZE, 0);
        if (!active) {
          return;
        }
        const normalizedFirstBatch = [...firstBatch]
          .sort((a, b) => parseDate(b.date) - parseDate(a.date))
          .filter((episode, index, list) => list.findIndex((item) => item.episodeUrl === episode.episodeUrl) === index)
          .slice(0, FIRST_BATCH_SIZE);
        setEpisodes(normalizedFirstBatch);
        setVisibleCount(FIRST_BATCH_SIZE);
        setFocusedItemId((current) => current || normalizedFirstBatch[0]?.episodeUrl || "");
        setLoading(false);

        fetchEpisodes(show.name, SECOND_BATCH_SIZE, FIRST_BATCH_SIZE)
          .then(async (nextBatch) => {
            if (!active) {
              return;
            }
            const normalizedNextBatch = [...nextBatch]
              .sort((a, b) => parseDate(b.date) - parseDate(a.date))
              .filter((episode, index, list) => list.findIndex((item) => item.episodeUrl === episode.episodeUrl) === index)
              .slice(0, SECOND_BATCH_SIZE);
            setPrefetchedEpisodes(normalizedNextBatch);
            await cacheEpisodes(show.name, [...normalizedFirstBatch, ...normalizedNextBatch]);
          })
          .catch((_error) => {
            if (!active) {
              return;
            }
            setPrefetchedEpisodes([]);
          });
      } catch (error) {
        if (!active) {
          return;
        }
        setLoading(false);
        navigation.replace("Error", {
          message: `Failed to load episodes: ${String(error)}`,
          retryRoute: "Show",
          retryParams: { provider },
        });
      }
    };
    load().catch((error) => {
      navigation.replace("Error", {
        message: `Failed to load episodes: ${String(error)}`,
        retryRoute: "Show",
        retryParams: { provider },
      });
    });
    return () => {
      active = false;
    };
  }, [navigation, provider, show.name]);

  const allEpisodes = useMemo(
    () =>
      [...episodes, ...prefetchedEpisodes]
        .sort((a, b) => parseDate(b.date) - parseDate(a.date))
        .filter((episode, index, list) => list.findIndex((item) => item.episodeUrl === episode.episodeUrl) === index)
        .slice(0, TOTAL_EPISODES_CAP),
    [episodes, prefetchedEpisodes],
  );

  const visibleEpisodes = useMemo(() => allEpisodes.slice(0, visibleCount), [allEpisodes, visibleCount]);

  const listItems = useMemo(() => {
    const items: EpisodeListItem[] = visibleEpisodes.map((episode) => ({ ...episode, kind: "episode" }));
    if (visibleCount < allEpisodes.length) {
      items.push({ kind: "loadMore", id: "load-more" });
    }
    return items;
  }, [allEpisodes.length, visibleEpisodes, visibleCount]);

  const onEpisodePress = async (episode: Episode) => {
    try {
      setResolvingVideo(true);
      const videoUrl = await fetchVideoUrl(episode.episodeUrl);
      setResolvingVideo(false);
      navigation.navigate("Player", { videoUrl });
    } catch (error) {
      setResolvingVideo(false);
      navigation.navigate("Error", {
        message: `Failed to load video: ${String(error)}`,
        retryRoute: "Episode",
        retryParams: { provider, show },
      });
    }
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: show.imageUrl }} style={styles.bannerImage} resizeMode="cover" />
      <Text style={styles.title}>{show.name}</Text>
      <Text style={styles.subtitle}>Latest Episodes</Text>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => (item.kind === "episode" ? item.episodeUrl : item.id)}
          numColumns={3}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) =>
            item.kind === "episode" ? (
              <EpisodeCard
                episode={item}
                onPress={onEpisodePress}
                preferredFocus={index === 0}
                isFocused={focusedItemId === item.episodeUrl}
                onFocus={setFocusedItemId}
              />
            ) : (
              <LoadMoreCard
                onPress={() => {
                  setVisibleCount(TOTAL_EPISODES_CAP);
                  setFocusedItemId("load-more");
                }}
                isFocused={focusedItemId === "load-more"}
                onFocus={() => setFocusedItemId("load-more")}
              />
            )
          }
          contentContainerStyle={styles.listContainer}
        />
      )}
      {resolvingVideo ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.overlayText}>Opening video...</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  bannerImage: {
    width: "100%",
    height: 180,
    borderRadius: 6,
    marginBottom: 10,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: "#afbed8",
    fontSize: 18,
    marginBottom: 14,
  },
  listContainer: {
    paddingBottom: 30,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  card: {
    flex: 1,
    minHeight: 118,
    backgroundColor: "#121c2d",
    borderRadius: 18,
    padding: 16,
    borderWidth: 3,
    borderColor: "transparent",
    overflow: "hidden",
  },
  cardFocused: {
    borderColor: "#8be9ff",
    shadowColor: "#74dcff",
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 18,
    transform: [{ scale: 1.03 }],
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  cardDate: {
    color: "#a9b4cd",
    fontSize: 14,
    marginTop: 4,
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: {
    marginTop: 10,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  loadMoreCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  loadMoreText: {
    marginTop: 8,
    color: "#afbed8",
    fontSize: 14,
  },
});
