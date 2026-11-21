import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import { deleteContact, getContacts } from "@/services/contactService";
import type { Contact, ContactType } from "@/types/contact";

const CONTACT_FILTERS: {
  label: string;
  type: ContactType | null;
}[] = [
  { label: "All", type: null },
  { label: "Doctors", type: "doctor" },
  { label: "Hospitals & clinics", type: "facility" },
  { label: "Emergency", type: "emergency" },
];

function contactTypeLabel(type: ContactType): string {
  switch (type) {
    case "doctor":
      return "Doctor";
    case "facility":
      return "Hospital or clinic";
    case "emergency":
      return "Emergency contact";
  }
}

function contactInitial(type: ContactType): string {
  switch (type) {
    case "doctor":
      return "D";
    case "facility":
      return "H";
    case "emergency":
      return "E";
  }
}

export default function ContactsScreen() {
  const database = useSQLiteContext();
  const { activeProfile, isLoading: profileLoading } = useUserProfiles();
  const colors = useTheme();
  const activeProfileId = activeProfile?.id ?? null;
  const [filter, setFilter] = useState<ContactType | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState<{
    key: string;
    contacts: Contact[];
    error: string | null;
  }>({ key: "", contacts: [], error: null });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchText.trim()), 200);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const queryKey = `${activeProfileId ?? ""}:${filter ?? "all"}:${search.toLowerCase()}`;

  useFocusEffect(
    useCallback(() => {
      if (!activeProfileId) return;
      let isCurrent = true;
      void getContacts(database, activeProfileId, search, filter ?? undefined)
        .then((contacts) => {
          if (isCurrent) setSnapshot({ key: queryKey, contacts, error: null });
        })
        .catch((error: unknown) => {
          console.error("Error loading contacts:", error);
          if (isCurrent) {
            setSnapshot({
              key: queryKey,
              contacts: [],
              error: "Contacts could not be loaded. Please try again.",
            });
          }
        });
      return () => {
        isCurrent = false;
      };
    }, [database, activeProfileId, filter, queryKey, search]),
  );

  const handleCall = async (contact: Contact) => {
    const phone = contact.phone.replace(/[\s().-]/g, "");
    if (!/^\+?\d{7,15}$/.test(phone)) {
      Alert.alert("Invalid phone number", "Edit this contact and check the number.");
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (error) {
      console.error("Could not open the phone app:", error);
      Alert.alert(
        "Could not start a call",
        "This device could not open a phone app for the saved number.",
      );
    }
  };

  const confirmDelete = (contact: Contact) => {
    Alert.alert(
      "Delete contact?",
      `Remove ${contact.name} from this profile's contacts?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!activeProfileId) return;
            setDeletingId(contact.id);
            try {
              await deleteContact(database, contact.id, activeProfileId);
              setSnapshot((current) =>
                current.key === queryKey
                  ? {
                      ...current,
                      contacts: current.contacts.filter(
                        (item) => item.id !== contact.id,
                      ),
                    }
                  : current,
              );
            } catch (error) {
              console.error("Error deleting contact:", error);
              Alert.alert("Could not delete contact", "Please try again.");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  if (profileLoading) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Loading profile...
        </Text>
      </SafeAreaView>
    );
  }

  if (!activeProfileId) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Select a profile to manage its contacts.
        </Text>
      </SafeAreaView>
    );
  }

  const loading = snapshot.key !== queryKey;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>Contacts</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Saved for {activeProfile?.name ?? "the active profile"}
        </Text>

        <TextInput
          accessibilityLabel="Search contacts"
          onChangeText={setSearchText}
          placeholder="Search name, specialty, phone, or address"
          returnKeyType="search"
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholderTextColor={colors.textSecondary}
          value={searchText}
        />

        <ScrollView
          contentContainerStyle={styles.filterList}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {CONTACT_FILTERS.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.type }}
              onPress={() => setFilter(item.type)}
              style={[
                styles.filterButton,
                filter === item.type && styles.selectedFilterButton,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item.type && styles.selectedFilterText,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <Text style={[styles.status, { color: colors.textSecondary }]}>
            Loading contacts...
          </Text>
        ) : snapshot.error ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {snapshot.error}
          </Text>
        ) : snapshot.contacts.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {search || filter ? "No matching contacts" : "No contacts yet"}
            </Text>
            <Text
              style={[styles.emptyDescription, { color: colors.textSecondary }]}
            >
              {search || filter
                ? "Try a different search or contact type."
                : "Save doctors, healthcare facilities, and emergency contacts here."}
            </Text>
          </View>
        ) : (
          snapshot.contacts.map((contact) => (
            <View
              key={contact.id}
              style={[
                styles.contactCard,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.contactHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {contactInitial(contact.type)}
                  </Text>
                </View>
                <View style={styles.contactHeading}>
                  <Text style={[styles.contactName, { color: colors.text }]}>
                    {contact.name}
                  </Text>
                  <Text
                    style={[
                      styles.contactType,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {contactTypeLabel(contact.type)}
                  </Text>
                </View>
              </View>

              {contact.specialty ? (
                <ContactDetail label="Specialty" value={contact.specialty} />
              ) : null}
              {contact.relationship ? (
                <ContactDetail
                  label="Relationship"
                  value={contact.relationship}
                />
              ) : null}
              <ContactDetail label="Phone" value={contact.phone} />
              {contact.email ? (
                <ContactDetail label="Email" value={contact.email} />
              ) : null}
              {contact.address ? (
                <ContactDetail label="Address" value={contact.address} />
              ) : null}
              {contact.notes ? (
                <ContactDetail label="Notes" value={contact.notes} />
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleCall(contact)}
                  style={[styles.actionButton, styles.callButton]}
                >
                  <Text style={styles.callText}>Call</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/profile/edit-contact",
                      params: { id: String(contact.id) },
                    })
                  }
                  style={styles.actionButton}
                >
                  <Text style={[styles.editText, { color: colors.accent }]}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={deletingId === contact.id}
                  onPress={() => confirmDelete(contact)}
                  style={styles.actionButton}
                >
                  <Text style={[styles.deleteText, { color: colors.danger }]}>
                    {deletingId === contact.id ? "Deleting..." : "Delete"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/profile/edit-contact")}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>＋ Add contact</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactDetail({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F7FAF9",
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    color: "#173D35",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#71817C",
    fontSize: 14,
    marginBottom: 16,
    marginTop: 6,
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    color: "#243B35",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  filterList: {
    gap: 8,
    paddingVertical: 14,
  },
  filterButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  selectedFilterButton: {
    backgroundColor: "#287A65",
    borderColor: "#287A65",
  },
  filterText: {
    color: "#64746E",
    fontSize: 13,
  },
  selectedFilterText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  status: {
    color: "#71817C",
    padding: 24,
    textAlign: "center",
  },
  errorText: {
    color: "#B04444",
    paddingVertical: 20,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
    padding: 24,
  },
  emptyTitle: {
    color: "#243B35",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyDescription: {
    color: "#71817C",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center",
  },
  contactCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  contactHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 12,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#D9EEE5",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: "#247A65",
    fontSize: 18,
    fontWeight: "700",
  },
  contactHeading: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    color: "#173D35",
    fontSize: 16,
    fontWeight: "700",
  },
  contactType: {
    color: "#71817C",
    fontSize: 12,
    marginTop: 3,
  },
  detailRow: {
    flexDirection: "row",
    paddingVertical: 5,
  },
  detailLabel: {
    color: "#71817C",
    fontSize: 13,
    width: 92,
  },
  detailValue: {
    color: "#243B35",
    flex: 1,
    fontSize: 13,
  },
  actions: {
    borderTopColor: "#EDF1EF",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 10,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  callButton: {
    marginRight: "auto",
  },
  callText: {
    color: "#287A65",
    fontSize: 14,
    fontWeight: "700",
  },
  editText: {
    color: "#287A65",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteText: {
    color: "#B04444",
    fontSize: 14,
    fontWeight: "600",
  },
  addButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 12,
    marginTop: 4,
    padding: 15,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
