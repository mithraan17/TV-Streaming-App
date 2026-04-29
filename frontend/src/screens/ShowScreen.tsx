import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PROVIDERS } from "../constants";
import { fetchShows } from "../services/api";
import { cacheShows, getCachedShows } from "../services/cache";
import { Provider, RootStackParamList, Show } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Show">;
type TVPressableState = { pressed: boolean; focused?: boolean };
type TVEvent = { eventType?: string };

const normalizeShows = (items: Show[]): Show[] =>
  items
    .filter((show) => Boolean(show?.url && show?.name))
    .map((show) => ({
      name: String(show.name),
      url: String(show.url),
      imageUrl: typeof show.imageUrl === "string" ? show.imageUrl : "",
    }))
    .filter((show, index, list) => list.findIndex((item) => item.url === show.url) === index)
    .slice(0, 6);

type ShowCardProps = {
  show: Show;
  onPress: (show: Show) => void;
  onFocus: (url: string) => void;
  preferredFocus: boolean;
  isSidebarOpen: boolean;
  isFocused: boolean;
  nextFocusLeft?: number;
  cardRef?: React.RefObject<View | null>;
};

const ShowCard = ({ show, onPress, onFocus, preferredFocus, isSidebarOpen, isFocused, nextFocusLeft, cardRef }: ShowCardProps) => (
  <Pressable
    ref={cardRef}
    onPress={() => onPress(show)}
    onFocus={() => onFocus(show.url)}
    hasTVPreferredFocus={preferredFocus && !isSidebarOpen}
    {...({ nextFocusLeft } as object)}
    style={(state) => [
      styles.card,
      (((state as TVPressableState).focused ?? false) || isFocused) && styles.cardFocused,
      isSidebarOpen && styles.cardDim,
    ]}
  >
    <Image source={{ uri: show.imageUrl }} style={styles.cardImage} resizeMode="cover" />
    <View style={styles.cardOverlay} />
    <View style={styles.cardCaption}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {show.name}
      </Text>
    </View>
  </Pressable>
);

export const ShowScreen = ({ route, navigation }: Props) => {
  const { provider } = route.params;
  const [selectedProvider, setSelectedProvider] = useState<Provider>(provider);
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [focusedShowUrl, setFocusedShowUrl] = useState<string>("");
  const [drawerFocusTarget, setDrawerFocusTarget] = useState<number | undefined>(undefined);
  const [firstCardFocusTarget, setFirstCardFocusTarget] = useState<number | undefined>(undefined);
  const drawerHandleRef = useRef<View | null>(null);
  const firstCardRef = useRef<View | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const cached = await getCachedShows();
        if (cached?.length && active) {
          const normalizedCached = normalizeShows(cached);
          setShows(normalizedCached);
          setFocusedShowUrl(normalizedCached[0]?.url || "");
          setLoading(false);
        }
        const liveShows = await fetchShows();
        if (!active) {
          return;
        }
        const sixShows = normalizeShows(liveShows);
        setShows(sixShows);
        setFocusedShowUrl((current) => current || sixShows[0]?.url || "");
        setLoading(false);
        await cacheShows(sixShows);
      } catch (error) {
        if (!active) {
          return;
        }
        setLoading(false);
        navigation.replace("Error", {
          message: `Failed to load shows: ${String(error)}`,
          retryRoute: "Provider",
        });
      }
    };
    load().catch((error) => {
      navigation.replace("Error", {
        message: `Failed to load shows: ${String(error)}`,
        retryRoute: "Provider",
      });
    });
    return () => {
      active = false;
    };
  }, [navigation]);

  useEffect(() => {
    const drawerTarget = drawerHandleRef.current ? (drawerHandleRef.current as unknown as { _nativeTag?: number })._nativeTag : undefined;
    const firstCardTarget = firstCardRef.current ? (firstCardRef.current as unknown as { _nativeTag?: number })._nativeTag : undefined;
    setDrawerFocusTarget(drawerTarget);
    setFirstCardFocusTarget(firstCardTarget);
  }, [shows]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
      }
      return false;
    });
    return () => {
      subscription.remove();
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const TVEventHandlerImpl = (require("react-native") as { TVEventHandler?: new () => any }).TVEventHandler;
    if (!TVEventHandlerImpl) {
      return;
    }
    const handler = new TVEventHandlerImpl();
    handler.enable(null, (_cmp: unknown, event: TVEvent) => {
      if (!event?.eventType) {
        return;
      }
      if (event.eventType === "left" && !sidebarOpen) {
        setSidebarOpen(true);
      }
      if (event.eventType === "right" && sidebarOpen) {
        setSidebarOpen(false);
      }
    });
    return () => {
      handler.disable();
    };
  }, [sidebarOpen]);

  const providerShows = useMemo(() => shows, [shows]);

  const onShowPress = (show: Show) => {
    navigation.navigate("Episode", { provider: selectedProvider, show });
  };

  const onShowFocus = (url: string) => {
    setFocusedShowUrl(url);
    if (sidebarOpen) {
      setSidebarOpen(false);
    }
  };

  const onProviderPress = (nextProvider: Provider) => {
    setSelectedProvider(nextProvider);
    setSidebarOpen(false);
  };

  return (
    <View style={styles.page}>
      <Pressable
        ref={drawerHandleRef}
        onFocus={() => setSidebarOpen(true)}
        onPress={() => setSidebarOpen(true)}
        style={(state) => [styles.drawerHandle, ((state as TVPressableState).focused ?? false) && styles.drawerHandleFocused]}
      >
        <Text style={styles.drawerIcon}>≡</Text>
      </Pressable>

      {sidebarOpen ? (
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Providers</Text>
          <FlatList
            data={PROVIDERS}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.sidebarList}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => onProviderPress(item)}
                onFocus={() => setSidebarOpen(true)}
                hasTVPreferredFocus={sidebarOpen && index === 0}
                {...({ nextFocusRight: firstCardFocusTarget } as object)}
                style={(state) => [
                  styles.providerItem,
                  selectedProvider.id === item.id && styles.providerActive,
                  ((state as TVPressableState).focused ?? false) && styles.providerFocused,
                ]}
              >
                <Text style={styles.providerLabel}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{selectedProvider.name}</Text>
          <Text style={styles.hint}>Press LEFT for providers</Text>
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : (
          <FlatList
            data={providerShows}
            keyExtractor={(item) => item.url}
            numColumns={3}
            scrollEnabled={false}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item, index }) => (
              <ShowCard
                show={item}
                onPress={onShowPress}
                onFocus={onShowFocus}
                preferredFocus={index === 0}
                isSidebarOpen={sidebarOpen}
                isFocused={focusedShowUrl === item.url}
                nextFocusLeft={index % 3 === 0 ? drawerFocusTarget : undefined}
                cardRef={index === 0 ? firstCardRef : undefined}
              />
            )}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0b1220",
    flexDirection: "row",
  },
  drawerHandle: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f1728",
  },
  drawerHandleFocused: {
    backgroundColor: "#18243a",
    shadowColor: "#69d4ff",
    shadowOpacity: 0.95,
    shadowRadius: 18,
    elevation: 12,
  },
  drawerIcon: {
    color: "#f5f7fb",
    fontSize: 34,
    fontWeight: "700",
  },
  sidebar: {
    position: "absolute",
    left: 56,
    top: 0,
    bottom: 0,
    width: 290,
    backgroundColor: "#121c2d",
    paddingTop: 24,
    zIndex: 10,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#dbe8ff",
    paddingHorizontal: 22,
    marginBottom: 10,
  },
  sidebarList: {
    paddingBottom: 20,
  },
  providerItem: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#162236",
  },
  providerActive: {
    backgroundColor: "#20304b",
  },
  providerFocused: {
    shadowColor: "#77dcff",
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 14,
    transform: [{ scale: 1.02 }],
  },
  providerLabel: {
    fontSize: 24,
    color: "#f5f7fb",
  },
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
  },
  hint: {
    color: "#afbed8",
    fontSize: 18,
  },
  listContainer: {
    gap: 20,
  },
  row: {
    gap: 18,
  },
  card: {
    flex: 1,
    minHeight: 260,
    borderRadius: 20,
    backgroundColor: "#121c2d",
    borderWidth: 3,
    borderColor: "transparent",
    overflow: "hidden",
  },
  cardFocused: {
    borderColor: "#8be9ff",
    shadowColor: "#74dcff",
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 18,
    transform: [{ scale: 1.03 }],
  },
  cardDim: {
    opacity: 0.45,
  },
  cardImage: {
    width: "100%",
    height: 190,
  },
  cardOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
    backgroundColor: "rgba(3,7,18,0.68)",
  },
  cardCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
});
