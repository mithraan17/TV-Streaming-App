import React from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Player">;

export const PlayerScreen = ({ route, navigation }: Props) => {
  const { videoUrl } = route.params;

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      navigation.goBack();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: videoUrl }}
        javaScriptEnabled
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        originWhitelist={["*"]}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        style={styles.webView}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  webView: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
