import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";

const tabIcons = {
  home: {
    active: "home",
    inactive: "home-outline",
    label: "Home",
  },
  calendar: {
    active: "calendar",
    inactive: "calendar-outline",
    label: "Calendar",
  },
  health: {
    active: "pulse",
    inactive: "pulse-outline",
    label: "Health",
  },
  medication: {
    active: "medkit",
    inactive: "medkit-outline",
    label: "Medication",
  },
  more: {
    active: "ellipsis-horizontal",
    inactive: "ellipsis-horizontal-outline",
    label: "More",
  },
} as const;

function CustomTabBar({ state }: any) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;
        const tab = tabIcons[route.name as keyof typeof tabIcons];

        if (!tab) return null;

        const onPress = () => {
          if (!isFocused) {
            router.navigate(`/${route.name}` as any);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={tab.label}
            onPress={onPress}
            style={styles.tabItem}
          >
            <View
              style={[
                styles.iconContainer,
                isFocused && {
                  backgroundColor:
                    scheme === "dark" ? colors.backgroundElement : "#FFFFFF",
                },
              ]}
            >
              <Ionicons
                name={isFocused ? tab.active : tab.inactive}
                size={25}
                color={isFocused ? colors.accent : colors.text}
              />

              {isFocused && (
                <Text style={[styles.tabLabel, { color: colors.text }]}>
                  {tab.label}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="health" />
      <Tabs.Screen name="medication" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    minWidth: 58,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: "500",
  },
});
