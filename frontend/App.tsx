import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { EpisodeScreen } from "./src/screens/EpisodeScreen";
import { ErrorScreen } from "./src/screens/ErrorScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import { ProviderScreen } from "./src/screens/ProviderScreen";
import { ShowScreen } from "./src/screens/ShowScreen";
import { RootStackParamList } from "./src/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const appTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#000000",
  },
};

export default function App() {
  return (
    <NavigationContainer theme={appTheme}>
      <Stack.Navigator
        initialRouteName="Show"
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          orientation: "landscape",
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="Provider" component={ProviderScreen} />
        <Stack.Screen
          name="Show"
          component={ShowScreen}
          initialParams={{
            provider: { id: "vijay", name: "Vijay TV", isMock: false },
          }}
        />
        <Stack.Screen name="Episode" component={EpisodeScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{
            animation: "fade",
            orientation: "landscape",
          }}
        />
        <Stack.Screen name="Error" component={ErrorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
