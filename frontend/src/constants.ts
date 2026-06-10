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
  // Railway backend URL - Update this with your Railway deployment URL
  // Format: https://your-project-name.up.railway.app
  // After deploying to Railway, get the public URL and paste it here
  const RAILWAY_BACKEND_URL = "https://tv-streaming-app-production.up.railway.app";
  
  // For local development only (keep for testing)
  const BACKEND_IP = "192.168.0.9";
  
  // Use Railway URL in production, fall back to local IP in development
  // Comment out the RAILWAY_BACKEND_URL line to use local IP discovery
  if (RAILWAY_BACKEND_URL && !RAILWAY_BACKEND_URL.includes("your-railway")) {
    return RAILWAY_BACKEND_URL;
  }
  
  const host = readExpoHostFromConstants() || readExpoHostFromSourceCode();
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:4000`;
  }
  if (Platform.OS === "android") {
    return `http://${BACKEND_IP}:4000`;
  }
  return `http://${BACKEND_IP}:4000`;
};

export const API_BASE_URL = resolveApiBaseUrl();
export const BACKEND_PORT = 4000;
export const DISCOVERY_TIMEOUT_MS = 1500;

export const PROVIDERS = [
  { id: "vijay", name: "Vijay TV", isMock: false },
];
