import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const loggedIn = await AsyncStorage.getItem("medimate_is_logged_in");
        if (!isMounted) return;
        if (loggedIn === "true") {
          setTarget("/(tabs)/home");
        } else {
          setTarget("/(auth)/login");
        }
      } catch {
        if (isMounted) setTarget("/(auth)/login");
      }
    }

    void checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  if (!target) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0B1521",
        }}
      >
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return <Redirect href={target as any} />;
}
