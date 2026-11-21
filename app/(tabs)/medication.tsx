import { useCallback, useState } from "react";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useFocusEffect, useRouter } from "expo-router";

import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";

// Medicine data structure
type Medicine = {
  id: number;
  name: string;
  medicine_form: string;
  dose: string;
  frequency: string;
  schedule_method: string;
  start_date: string;
  end_date: string | null;
  status: string;
};

export default function MedicationScreen() {
  const router = useRouter();

  // Connect to the local SQLite database
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const colors = useTheme();

  // Store medicines loaded from SQLite
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  // Search and filter states
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");

  const filters = ["All", "Active", "Completed"];

  // Load medicines whenever this screen becomes active
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadMedicines() {
        if (!activeProfile) return;
        try {
          const records = await database.getAllAsync<Medicine>(
            "SELECT * FROM medicines WHERE user_id = ? ORDER BY id DESC",
            activeProfile.id,
          );

          if (isActive) {
            setMedicines(records);
          }
        } catch (error) {
          console.error("Error loading medicines:", error);
        }
      }

      loadMedicines();

      return () => {
        isActive = false;
      };
    }, [activeProfile, database]),
  );

  // Search and filter medicines
  const filteredMedicines = medicines.filter((medicine) => {
    const matchesSearch = medicine.name
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesFilter =
      selectedFilter === "All" ||
      (selectedFilter === "Active" && medicine.status === "ACTIVE") ||
      (selectedFilter === "Completed" && medicine.status === "COMPLETED");

    return matchesSearch && matchesFilter;
  });

  // Count medicines
  const totalMedicines = medicines.length;

  const activeMedicines = medicines.filter(
    (medicine) => medicine.status === "ACTIVE",
  ).length;

  const completedMedicines = medicines.filter(
    (medicine) => medicine.status === "COMPLETED",
  ).length;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}

        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              My Medicines
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Manage your medications
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Text style={styles.iconText}>💊</Text>
          </View>
        </View>

        {/* Search */}

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>

          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search medicines"
            placeholder="Search medicines..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Filters */}

        <View style={styles.filterContainer}>
          {filters.map((filter) => {
            const isSelected = selectedFilter === filter;

            return (
              <Pressable
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[
                  styles.filterButton,
                  isSelected && styles.selectedFilter,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    isSelected && styles.selectedFilterText,
                  ]}
                >
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Medicine Summary */}

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{totalMedicines}</Text>

            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{activeMedicines}</Text>

            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{completedMedicines}</Text>

            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Completed</Text>
          </View>
        </View>

        {/* Medicine List Header */}

        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Your Medicines
          </Text>

          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {filteredMedicines.length} medicines
          </Text>
        </View>

        {/* Medicine List */}

        {filteredMedicines.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>💊</Text>
            </View>

            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {medicines.length === 0
                ? "No medicines added yet"
                : "No matching medicines found"}
            </Text>

            <Text
              style={[styles.emptyDescription, { color: colors.textSecondary }]}
            >
              {medicines.length === 0
                ? "Start managing your medications by adding your first medicine."
                : "Try another search term or select a different filter."}
            </Text>

            {medicines.length === 0 && (
              <Pressable
                style={styles.emptyButton}
                onPress={() => router.push("/medication/add-medicine")}
              >
                <Text style={styles.buttonText}>+ Add Your First Medicine</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredMedicines.map((medicine) => (
            <Pressable
              key={medicine.id}
              style={[
                styles.medicineCard,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                },
              ]}
              onPress={() =>
                router.push({
                  pathname: "/medication/[id]",
                  params: { id: String(medicine.id) },
                })
              }
            >
              <View style={styles.medicineHeader}>
                <View style={styles.medicineIconContainer}>
                  <Text style={styles.medicineIcon}>💊</Text>
                </View>

                <View style={styles.medicineNameContainer}>
                  <Text style={[styles.medicineName, { color: colors.text }]}>
                    {medicine.name}
                  </Text>

                  <Text
                    style={[
                      styles.medicineForm,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {medicine.medicine_form}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    medicine.status === "ACTIVE"
                      ? styles.activeBadge
                      : styles.completedBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      medicine.status === "ACTIVE"
                        ? styles.activeText
                        : styles.completedText,
                    ]}
                  >
                    {medicine.status}
                  </Text>
                </View>
              </View>

              <View style={styles.medicineDetails}>
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                  Prescribed dose: {medicine.dose}
                </Text>

                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                  Frequency: {medicine.frequency}
                </Text>

                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                  Schedule: {medicine.schedule_method}
                </Text>

                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                  Start date: {medicine.start_date}
                </Text>

                {medicine.end_date && (
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                    End date: {medicine.end_date}
                  </Text>
                )}
              </View>

              <Text style={styles.viewDetailsText}>View Details →</Text>
            </Pressable>
          ))
        )}

        {/* Add Medicine Button */}

        <Pressable
          style={styles.addButton}
          onPress={() => router.push("/medication/add-medicine")}
        >
          <Text style={styles.addButtonText}>+ Add New Medicine</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAF9",
  },

  container: {
    flex: 1,
  },

  content: {
    padding: 20,
    paddingBottom: 35,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
    marginBottom: 25,
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#173D35",
  },

  subtitle: {
    fontSize: 14,
    color: "#82918D",
    marginTop: 6,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#E3F2EA",
    justifyContent: "center",
    alignItems: "center",
  },

  iconText: {
    fontSize: 25,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    paddingHorizontal: 15,
    height: 52,
    borderWidth: 1,
    borderColor: "#E8EEEB",
  },

  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#173D35",
  },

  filterContainer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    marginBottom: 20,
  },

  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5ECE8",
  },

  selectedFilter: {
    backgroundColor: "#287A65",
    borderColor: "#287A65",
  },

  filterText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "500",
  },

  selectedFilterText: {
    color: "#FFFFFF",
  },

  summaryCard: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    paddingVertical: 18,
    marginBottom: 25,
  },

  summaryItem: {
    alignItems: "center",
    flex: 1,
  },

  summaryNumber: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#287A65",
  },

  summaryLabel: {
    fontSize: 12,
    color: "#82918D",
    marginTop: 5,
  },

  divider: {
    width: 1,
    height: 35,
    backgroundColor: "#E8EEEB",
  },

  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#173D35",
  },

  countText: {
    fontSize: 12,
    color: "#82918D",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 25,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EDF1EF",
  },

  emptyIconContainer: {
    width: 75,
    height: 75,
    borderRadius: 38,
    backgroundColor: "#E8F5EE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  emptyIcon: {
    fontSize: 35,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#263F38",
    textAlign: "center",
  },

  emptyDescription: {
    fontSize: 13,
    color: "#82918D",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 9,
  },

  emptyButton: {
    backgroundColor: "#E6F3EC",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginTop: 20,
  },

  buttonText: {
    color: "#287A65",
    fontWeight: "600",
    fontSize: 13,
  },

  medicineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EDF1EF",
  },

  medicineHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  medicineIconContainer: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: "#E8F5EE",
    alignItems: "center",
    justifyContent: "center",
  },

  medicineIcon: {
    fontSize: 22,
  },

  medicineNameContainer: {
    flex: 1,
    marginLeft: 12,
  },

  medicineName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#173D35",
  },

  medicineForm: {
    fontSize: 12,
    color: "#82918D",
    marginTop: 4,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 15,
  },

  activeBadge: {
    backgroundColor: "#E5F3EB",
  },

  completedBadge: {
    backgroundColor: "#EEF0F2",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "bold",
  },

  activeText: {
    color: "#287A65",
  },

  completedText: {
    color: "#64748B",
  },

  medicineDetails: {
    borderTopWidth: 1,
    borderTopColor: "#EDF1EF",
    marginTop: 15,
    paddingTop: 12,
    gap: 7,
  },

  detailText: {
    fontSize: 13,
    color: "#64748B",
  },

  viewDetailsText: {
    color: "#287A65",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "right",
    marginTop: 14,
  },

  addButton: {
    backgroundColor: "#287A65",
    padding: 17,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 20,
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
});
