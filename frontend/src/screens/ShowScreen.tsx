import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { PROVIDERS } from "../constants";
import { fetchAllShows, fetchShowImage } from "../services/api";
import { Provider, RootStackParamList, Show } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Show">;
type TVPressableState = { pressed: boolean; focused?: boolean };
type TVEvent = { eventType?: string };

type Category = "serials" | "shows";

const VIJAY_CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "serials", label: "Serials" },
  { id: "shows", label: "Shows" },
];

const normalizeShows = (items: Show[]): Show[] =>
  items
    .filter((show) => Boolean(show?.url && show?.name))
    .map((show) => ({
      name: String(show.name),
      url: String(show.url),
      imageUrl: typeof show.imageUrl === "string" ? show.imageUrl : "",
    }))
    .filter((show, index, list) => list.findIndex((item) => item.url === show.url) === index);

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
    <Image
      source={show.imageUrl ? { uri: show.imageUrl } : { uri: 'https://via.placeholder.com/600x400?text=No+Image' }}
      style={styles.cardImage}
      resizeMode="cover"
    />
    <View style={styles.cardOverlay} />
    <View style={styles.cardCaption}>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {show.name}
      </Text>
    </View>
  </Pressable>
);

export const ShowScreen = ({ route, navigation }: Props) => {
  const { provider } = route.params;
  const [selectedProvider, setSelectedProvider] = useState<Provider>(provider);
  const [serials, setSerials] = useState<Show[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [vijayExpanded, setVijayExpanded] = useState<boolean>(false);
  const [focusedShowUrl, setFocusedShowUrl] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("serials");
  const drawerHandleRef = useRef<View | null>(null);
  const firstCardRef = useRef<View | null>(null);
  const [drawerFocusTarget, setDrawerFocusTarget] = useState<number | undefined>(undefined);
  const [firstCardFocusTarget, setFirstCardFocusTarget] = useState<number | undefined>(undefined);

  const isVijayProvider = selectedProvider.id === "vijay";
  const activeShows = selectedCategory === "shows" ? shows : serials;
  const activeLabel = selectedCategory === "shows" ? "Shows" : "Serials";

  useEffect(() => {
    let active = true;

    const loadShows = async () => {
      if (!isVijayProvider) {
        setSerials([]);
        setShows([]);
        setFocusedShowUrl("");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { serials: serialList, shows: showList } = await fetchAllShows();
        if (!active) return;
        setSerials(serialList || []);
        setShows(showList || []);
        setFocusedShowUrl((current) => current || serialList[0]?.url || showList[0]?.url || "");
        setLoading(false);
      } catch (error) {
        if (!active) return;
        setLoading(false);
        navigation.replace("Error", {
          message: `Failed to load shows: ${String(error)}`,
          retryRoute: "Provider",
        });
      }
    };

    loadShows().catch((error) => {
      navigation.replace("Error", {
        message: `Failed to load shows: ${String(error)}`,
        retryRoute: "Provider",
      });
    });

    return () => {
      active = false;
    };
  }, [isVijayProvider, navigation]);

  useEffect(() => {
    const drawerTarget = drawerHandleRef.current ? (drawerHandleRef.current as unknown as { _nativeTag?: number })._nativeTag : undefined;
    const firstCardTarget = firstCardRef.current ? (firstCardRef.current as unknown as { _nativeTag?: number })._nativeTag : undefined;
    setDrawerFocusTarget(drawerTarget);
    setFirstCardFocusTarget(firstCardTarget);
  }, [serials, shows, selectedCategory]);

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

  const onShowFocus = (url: string) => {
    setFocusedShowUrl(url);
    if (sidebarOpen) {
      setSidebarOpen(false);
    }
  };

  // When a show becomes focused, attempt to fetch its image if missing
  useEffect(() => {
    let active = true;
    const loadFocusedImage = async () => {
      if (!focusedShowUrl) return;
      const findAndUpdate = async (
        listSetter: React.Dispatch<React.SetStateAction<Show[]>>,
        list: Show[],
      ): Promise<boolean> => {
        const idx = list.findIndex((s: Show) => s.url === focusedShowUrl);
        if (idx === -1) return false;
        const item = list[idx];
        if (!item) return false;
        if (item.imageUrl) return true;
        try {
          const imageUrl = await fetchShowImage(item.url);
          if (!active) return true;
          if (imageUrl) {
            const updated: Show[] = [...list];
            updated[idx] = { name: String(item.name || ""), url: String(item.url || ""), imageUrl };
            listSetter(updated);
          }
        } catch (_err) {
          // ignore image fetch errors
        }
        return true;
      };

      // Try serials first, then shows
      if (serials && serials.length) {
        const done = await findAndUpdate(setSerials, serials);
        if (done) return;
      }
      if (shows && shows.length) {
        await findAndUpdate(setShows, shows);
      }
    };
    loadFocusedImage();
    return () => {
      active = false;
    };
  }, [focusedShowUrl, serials, shows]);

  const onProviderPress = () => {
    setVijayExpanded((prev) => !prev);
  };

  const onCategoryPress = (category: Category) => {
    setSelectedCategory(category);
    setFocusedShowUrl("");
  };

  const onShowPress = (show: Show) => {
    navigation.push("Episode", { provider: selectedProvider, show });
  };

  const renderShowItem = ({ item, index }: { item: Show; index: number }) => (
    <View style={[styles.cardWrapper, index % 2 === 0 ? styles.cardLeft : styles.cardRight]} key={item.url}>
      <ShowCard
        show={item}
        onPress={onShowPress}
        onFocus={onShowFocus}
        preferredFocus={index === 0}
        isSidebarOpen={sidebarOpen}
        isFocused={focusedShowUrl === item.url}
        nextFocusLeft={drawerFocusTarget}
        cardRef={index === 0 ? firstCardRef : undefined}
      />
    </View>
  );

  const renderCategoryButton = (category: { id: Category; label: string }) => (
    <Pressable
      key={category.id}
      onPress={() => onCategoryPress(category.id)}
      onFocus={() => setSidebarOpen(true)}
      hasTVPreferredFocus={category.id === 'serials'}
      {...({ nextFocusRight: firstCardFocusTarget } as object)}
      style={({ focused }: TVPressableState) => [
        styles.categoryButton,
        selectedCategory === category.id && styles.categoryButtonActive,
        focused && styles.categoryButtonFocused,
      ]}
    >
      {({ focused }: TVPressableState) => (
        <>
          <View
            style={[
              styles.categoryIndicator,
              selectedCategory === category.id && styles.categoryIndicatorActive,
              focused && styles.categoryIndicatorFocused,
            ]}
          />
          <Text style={styles.categoryLabel}>{category.label}</Text>
        </>
      )}
    </Pressable>
  );

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
          <Pressable
            onPress={onProviderPress}
            onFocus={() => {
              setSidebarOpen(true);
              setVijayExpanded(true);
            }}
            hasTVPreferredFocus={sidebarOpen}
            {...({ nextFocusRight: firstCardFocusTarget } as object)}
            style={(state) => [
              styles.providerItem,
              ((state as TVPressableState).focused ?? false) && styles.providerFocused,
            ]}
          >
            <Text style={styles.providerLabel}>Vijay TV</Text>
            <Text style={styles.dropdownIcon}>{vijayExpanded ? "▼" : "▶"}</Text>
          </Pressable>

          {vijayExpanded ? (
            <View style={styles.providerSection}>
              {VIJAY_CATEGORIES.map((category, index) => (
                <Pressable
                  key={category.id}
                  onPress={() => onCategoryPress(category.id)}
                  onFocus={() => setSidebarOpen(true)}
                  hasTVPreferredFocus={index === 0}
                  {...({ nextFocusRight: firstCardFocusTarget } as object)}
                  style={({ focused }: TVPressableState) => [
                    styles.categoryButton,
                    selectedCategory === category.id && styles.categoryButtonActive,
                    focused && styles.categoryButtonFocused,
                  ]}
                >
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
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
        ) : !isVijayProvider ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Only Vijay TV is available for live serials and shows at this time.</Text>
            <Text style={styles.emptySubtitle}>Choose Vijay TV from the provider menu to continue.</Text>
          </View>
        ) : (
          <View style={styles.contentArea}>
            <View style={styles.categoryHeader}>
              <Text style={styles.sectionTitle}>{activeLabel}</Text>
            </View>
            {activeShows.length ? (
              <FlatList
                data={activeShows}
                keyExtractor={(item) => item.url}
                numColumns={2}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listContainer}
                renderItem={renderShowItem}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>No {activeLabel.toLowerCase()} found.</Text>
              </View>
            )}
          </View>
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
    paddingBottom: 12,
  },
  providerItem: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#162236",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  dropdownIcon: {
    fontSize: 20,
    color: "#f5f7fb",
  },
  providerSection: {
    paddingHorizontal: 20,
  },
  categoryButton: {
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#152333",
    position: "relative",
  },
  categoryButtonActive: {
    backgroundColor: "#20304b",
  },
  categoryButtonFocused: {
    shadowColor: "#77dcff",
    shadowOpacity: 0.95,
    shadowRadius: 18,
    elevation: 10,
    transform: [{ scale: 1.02 }],
  },
  categoryIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: "transparent",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  categoryIndicatorActive: {
    backgroundColor: "#69d4ff",
  },
  categoryIndicatorFocused: {
    backgroundColor: "#9ee8ff",
  },
  categoryLabel: {
    color: "#f5f7fb",
    fontSize: 18,
    fontWeight: "700",
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
  emptyTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  emptySubtitle: {
    color: "#afbed8",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
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
  contentArea: {
    flex: 1,
  },
  categoryHeader: {
    marginBottom: 18,
  },
  listContainer: {
    paddingBottom: 30,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardWrapper: {
    flex: 1,
    marginBottom: 18,
  },
  cardLeft: {
    marginRight: 14,
  },
  cardRight: {
    marginLeft: 14,
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
  sectionTitle: {
    color: "#dbe8ff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
});
