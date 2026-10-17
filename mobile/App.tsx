import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { navigationAction } from "./navigation.cjs";
import profiles from "./profiles.json";

type Profile = keyof typeof profiles;
const profile = Constants.expoConfig?.extra?.profile as Profile;
if (!Object.hasOwn(profiles, profile)) throw new Error("Perfil do aplicativo não configurado");
const app = profiles[profile];
const loginUrl = app.origin + app.loginPath;

export default function App() {
  const web = useRef<WebView<object>>(null);
  const canGoBack = useRef(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      web.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const openExternal = (url: string) => {
    if (navigationAction(url, profile) === "external") {
      void Linking.openURL(url).catch(() => setFailed(true));
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
        {failed ? (
          <View style={styles.feedback}>
            <Text style={styles.title}>{app.name}</Text>
            <Text>Não foi possível carregar. Confira sua conexão.</Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: app.color }]}
              onPress={() => {
                setFailed(false);
                setReloadKey((value) => value + 1);
              }}
            >
              <Text style={styles.buttonText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : (
          <WebView<object>
            key={reloadKey}
            ref={web}
            source={{ uri: loginUrl }}
            applicationNameForUserAgent={"PedeTremNative/" + profile}
            originWhitelist={["https://*", "mailto:*", "tel:*", "whatsapp:*"]}
            javaScriptEnabled
            domStorageEnabled
            geolocationEnabled
            allowsBackForwardNavigationGestures
            mixedContentMode="never"
            allowFileAccess={false}
            thirdPartyCookiesEnabled={false}
            setSupportMultipleWindows
            onShouldStartLoadWithRequest={(request) => {
              const action = navigationAction(request.url, profile);
              if (action === "external") openExternal(request.url);
              return action === "allow";
            }}
            onOpenWindow={({ nativeEvent }) => {
              if (navigationAction(nativeEvent.targetUrl, profile) === "allow") {
                // Only allow the configured HTTPS origin; JSON stringifies the URL as data.
                web.current?.injectJavaScript(
                  "window.location.assign(" + JSON.stringify(nativeEvent.targetUrl) + ");true;",
                );
              } else openExternal(nativeEvent.targetUrl);
            }}
            onNavigationStateChange={(state) => {
              canGoBack.current = state.canGoBack;
            }}
            onError={() => setFailed(true)}
            onHttpError={({ nativeEvent }) => {
              if (nativeEvent.statusCode >= 500) setFailed(true);
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.feedback}>
                <ActivityIndicator color={app.color} />
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  feedback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  button: { padding: 16, borderRadius: 12 },
  buttonText: { color: "#ffffff", fontWeight: "700" },
});
