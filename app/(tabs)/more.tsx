import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useTheme } from "@/hooks/use-theme";

export default function MoreScreen() {
  const colors = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>More</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage your MediMate application
        </Text>
      </View>

      <View style={styles.menuContainer}>
        <MenuItem
          title="My Profile"
          description="Manage your personal information"
          onPress={() => router.push("/profile")}
        />
        <MenuItem
          title="Dependents"
          description="Manage family members"
          onPress={() => router.push("/profile/dependents")}
        />
        <MenuItem
          title="Reports & Logbook"
          description="View medication and health reports"
          onPress={() => router.push("/reports")}
        />
        <MenuItem
          title="Contacts"
          description="Manage doctors, facilities, and emergency contacts"
          onPress={() => router.push("/profile/contacts")}
        />
        <MenuItem
          title="Settings"
          description="Manage app preferences"
          onPress={() => router.push("/settings")}
        />
        <MenuItem
          title="About MediMate"
          description="Learn about this application"
          onPress={() => router.push("/settings/about")}
        />
      </View>
    </ScrollView>
  );
}

function MenuItem({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress?: () => void;
}) {
  const colors = useTheme();
  const content = (
    <>
      <View>
        <Text style={[styles.menuTitle, { color: colors.text }]}>{title}</Text>
        <Text
          style={[styles.menuDescription, { color: colors.textSecondary }]}
        >
          {description}
        </Text>
      </View>
      <Text style={[styles.arrow, { color: colors.accent }]}>›</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.menuItem,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
          },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.menuItem,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 50,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
  },
  menuContainer: {
    paddingHorizontal: 20,
  },
  menuItem: {
    padding: 20,
    marginBottom: 12,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  menuDescription: {
    fontSize: 13,
    marginTop: 5,
  },
  arrow: {
    fontSize: 28,
  },
});
