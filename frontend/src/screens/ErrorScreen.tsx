import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Error">;
type TVPressableState = { pressed: boolean; focused?: boolean };

export const ErrorScreen = ({ route, navigation }: Props) => {
  const { message, retryRoute, retryParams } = route.params;

  const onRetry = () => {
    navigation.replace(retryRoute, retryParams as never);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something failed</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={(state) => [styles.button, (state as TVPressableState).focused && styles.buttonFocused]} onPress={onRetry}>
        <Text style={styles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#120606",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "#ff8b8b",
    fontSize: 34,
    fontWeight: "700",
  },
  message: {
    marginTop: 12,
    fontSize: 17,
    color: "#ffe8e8",
    textAlign: "center",
  },
  button: {
    marginTop: 22,
    backgroundColor: "#ef5350",
    borderWidth: 2,
    borderColor: "transparent",
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonFocused: {
    borderColor: "#ffffff",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
});
