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

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
      iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: none; }
    </style>
  </head>
  <body>
    <iframe src="${videoUrl}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </body>
</html>`;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        javaScriptEnabled
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        originWhitelist={["*"]}
        scrollEnabled={false}
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
