import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const extractHost = (value: string): string => {
  const withProtocol = value.includes("://") ? value : `http://${value}`;
  const match = withProtocol.match(/https?:\/\/([^/:]+)/i);
  return match?.[1] || "";
};

const readExpoHostFromSourceCode = (): string => {
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  const scriptURL = sourceCode?.scriptURL || "";
  return extractHost(scriptURL);
};

const readExpoHostFromConstants = (): string => {
  const expoConfigHost = Constants.expoConfig?.hostUri || "";
  const manifestHost =
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost || "";
  const manifest2Host =
    (
      Constants as unknown as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri || "";
  return extractHost(expoConfigHost) || extractHost(manifestHost) || extractHost(manifest2Host);
};

const resolveApiBaseUrl = (): string => {
  const host = readExpoHostFromConstants() || readExpoHostFromSourceCode();
  if (host) {
    return `http://${host}:4000`;
  }
  if (Platform.OS === "android") {
    return "http://10.0.2.2:4000";
  }
  return "http://localhost:4000";
};

export const API_BASE_URL = resolveApiBaseUrl();
export const BACKEND_PORT = 4000;
export const DISCOVERY_TIMEOUT_MS = 1500;

export const PROVIDERS = [
  { id: "vijay", name: "Vijay TV", isMock: false },
];
