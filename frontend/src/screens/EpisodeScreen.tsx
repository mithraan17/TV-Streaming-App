import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchEpisodes, fetchVideoUrl } from "../services/api";
import { Episode, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Episode">;
type TVPressableState = { pressed: boolean; focused?: boolean };
type EpisodeTile = Episode & { kind: "episode" };
type EpisodeListItem = EpisodeTile;
const FIRST_BATCH_SIZE = 10;
const TOTAL_EPISODES_CAP = 10;

const parseDate = (value: string): number => {
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  return 0;
};

const normalizeEpisodes = (items: Episode[], limit: number): Episode[] =>
  items
    .filter((episode) => Boolean(episode?.episodeUrl && episode?.title))
    .map((episode) => ({
      title: String(episode.title),
      date: typeof episode.date === "string" ? episode.date : "",
      episodeUrl: String(episode.episodeUrl),
    }))
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))
    .filter((episode, index, list) => list.findIndex((item) => item.episodeUrl === episode.episodeUrl) === index)
    .slice(0, limit);

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

export const EpisodeScreen = ({ route, navigation }: Props) => {
  const { provider, show } = route.params;
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolvingVideo, setResolvingVideo] = useState<boolean>(false);
  const [focusedItemId, setFocusedItemId] = useState<string>("");

  useEffect(() => {
    setEpisodes([]);
    setFocusedItemId("");
    setLoading(true);
  }, [show.name]);

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
        const batch = await fetchEpisodes(show.url || show.name, FIRST_BATCH_SIZE, 0);
        if (!active) {
          return;
        }
        const normalizedBatch = normalizeEpisodes(batch, FIRST_BATCH_SIZE);
        setEpisodes(normalizedBatch);
        setFocusedItemId((current) => current || normalizedBatch[0]?.episodeUrl || "");
        setLoading(false);
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

  const visibleEpisodes = useMemo(() => episodes, [episodes]);

  const listItems = useMemo(() => visibleEpisodes.map((episode) => ({ ...episode, kind: "episode" })), [visibleEpisodes]);

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
    <View key={show.url || show.name} style={styles.container}>
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
          keyExtractor={(item) => item.episodeUrl}
          numColumns={3}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => (
            <EpisodeCard
              episode={item}
              onPress={onEpisodePress}
              preferredFocus={index === 0}
              isFocused={focusedItemId === item.episodeUrl}
              onFocus={setFocusedItemId}
            />
          )}
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
});
