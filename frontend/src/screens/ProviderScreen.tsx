import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PROVIDERS } from "../constants";
import { RootStackParamList, Provider } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Provider">;
type TVPressableState = { pressed: boolean; focused?: boolean };

const ProviderCard = ({
  item,
  onPress,
  preferredFocus,
}: {
  item: Provider;
  onPress: (provider: Provider) => void;
  preferredFocus: boolean;
}) => (
  <Pressable
    onPress={() => onPress(item)}
    hasTVPreferredFocus={preferredFocus}
    style={(state) => [styles.card, (state as TVPressableState).focused && styles.cardFocused]}
  >
    <Text style={styles.cardTitle}>{item.name}</Text>
    <Text style={styles.cardSubtitle}>{item.isMock ? "Mock provider" : "Live scraped provider"}</Text>
  </Pressable>
);

export const ProviderScreen = ({ navigation }: Props) => {
  const handleProviderPress = (provider: Provider) => {
    navigation.navigate("Show", { provider });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Provider</Text>
      <FlatList
        data={PROVIDERS}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item, index }) => (
          <ProviderCard item={item} onPress={handleProviderPress} preferredFocus={index === 0} />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05070d",
    paddingHorizontal: 36,
    paddingVertical: 24,
  },
  title: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "700",
    marginBottom: 20,
  },
  listContainer: {
    gap: 20,
  },
  row: {
    gap: 18,
  },
  card: {
    flex: 1,
    minHeight: 140,
    borderRadius: 14,
    backgroundColor: "#1b1f2c",
    padding: 20,
    borderWidth: 2,
    borderColor: "transparent",
    justifyContent: "center",
  },
  cardFocused: {
    borderColor: "#42a5ff",
    transform: [{ scale: 1.02 }],
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "700",
  },
  cardSubtitle: {
    marginTop: 8,
    color: "#9ca6bf",
    fontSize: 16,
  },
});
