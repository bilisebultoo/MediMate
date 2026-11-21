import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { createContact, getContact, updateContact } from "@/services/contactService";
import type { Contact, ContactInput, ContactType } from "@/types/contact";

const CONTACT_TYPES: { label: string; value: ContactType }[] = [
  { label: "Doctor", value: "doctor" },
  { label: "Hospital / clinic", value: "facility" },
  { label: "Emergency", value: "emergency" },
];

export default function EditContactScreen() {
  const database = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { activeProfile, isLoading: profileLoading } = useUserProfiles();
  const activeProfileId = activeProfile?.id ?? null;
  const contactId = id ? Number(id) : null;
  const invalidId =
    id !== undefined &&
    (!Number.isSafeInteger(contactId) || (contactId ?? 0) <= 0);
  const lookupKey = `${activeProfileId ?? ""}:${contactId ?? ""}`;
  const [lookup, setLookup] = useState<{
    key: string;
    contact: Contact | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (invalidId || contactId === null || !activeProfileId) return;
    let isCurrent = true;
    void getContact(database, contactId, activeProfileId)
      .then((contact) => {
        if (isCurrent) {
          setLookup({
            key: lookupKey,
            contact,
            error: contact ? null : "This contact could not be found.",
          });
        }
      })
      .catch((error: unknown) => {
        console.error("Error loading contact:", error);
        if (isCurrent) {
          setLookup({
            key: lookupKey,
            contact: null,
            error: "This contact could not be loaded. Please try again.",
          });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [activeProfileId, contactId, database, invalidId, lookupKey]);

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.message}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!activeProfileId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.message}>
          Select a profile before adding or editing contacts.
        </Text>
      </SafeAreaView>
    );
  }

  if (invalidId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.message}>This contact could not be found.</Text>
      </SafeAreaView>
    );
  }

  let contact: Contact | null = null;
  if (contactId !== null) {
    if (lookup?.key !== lookupKey) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <Text style={styles.message}>Loading contact...</Text>
        </SafeAreaView>
      );
    }
    if (lookup.error || !lookup.contact) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <Text style={styles.message}>
            {lookup.error ?? "This contact could not be found."}
          </Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>Back to contacts</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    contact = lookup.contact;
  }

  return (
    <ContactForm
      key={`${activeProfileId}:${contactId ?? "new"}`}
      activeProfileId={activeProfileId}
      contact={contact}
      database={database}
    />
  );
}

function ContactForm({
  activeProfileId,
  contact,
  database,
}: {
  activeProfileId: string;
  contact: Contact | null;
  database: ReturnType<typeof useSQLiteContext>;
}) {
  const [type, setType] = useState<ContactType>(contact?.type ?? "doctor");
  const [name, setName] = useState(contact?.name ?? "");
  const [specialty, setSpecialty] = useState(contact?.specialty ?? "");
  const [relationship, setRelationship] = useState(
    contact?.relationship ?? "",
  );
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const normalizedPhone = trimmedPhone.replace(/[\s().-]/g, "");
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      Alert.alert("Add a name", "Enter a name for this contact.");
      return;
    }
    if (!/^\+?\d{7,15}$/.test(normalizedPhone)) {
      Alert.alert(
        "Check the phone number",
        "Enter a phone number with 7 to 15 digits. You can include a leading +.",
      );
      return;
    }
    if (
      trimmedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    ) {
      Alert.alert("Check the email", "Enter a valid email address.");
      return;
    }

    const input: ContactInput = {
      type,
      name: trimmedName,
      specialty: type === "doctor" ? specialty.trim() || null : null,
      relationship: type === "emergency" ? relationship.trim() || null : null,
      phone: trimmedPhone,
      email: trimmedEmail || null,
      address: type === "facility" ? address.trim() || null : null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    try {
      if (contact) {
        await updateContact(database, contact.id, activeProfileId, input);
      } else {
        await createContact(database, activeProfileId, input);
      }
      router.back();
    } catch (error) {
      console.error("Error saving contact:", error);
      Alert.alert("Could not save contact", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {contact ? "Edit contact" : "Add contact"}
          </Text>

          <Text style={styles.label}>Contact type</Text>
          <View style={styles.typeOptions}>
            {CONTACT_TYPES.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: type === option.value }}
                onPress={() => setType(option.value)}
                style={[
                  styles.typeOption,
                  type === option.value && styles.selectedTypeOption,
                ]}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    type === option.value && styles.selectedTypeOptionText,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            accessibilityLabel="Contact name"
            autoCapitalize="words"
            maxLength={120}
            onChangeText={setName}
            placeholder={
              type === "facility"
                ? "Hospital or clinic name"
                : type === "emergency"
                  ? "Contact person's name"
                  : "Doctor's name"
            }
            style={styles.input}
            value={name}
          />

          {type === "doctor" ? (
            <>
              <Text style={styles.label}>Specialty</Text>
              <TextInput
                accessibilityLabel="Doctor specialty"
                maxLength={120}
                onChangeText={setSpecialty}
                placeholder="e.g. Cardiologist"
                style={styles.input}
                value={specialty}
              />
            </>
          ) : null}

          {type === "emergency" ? (
            <>
              <Text style={styles.label}>Relationship</Text>
              <TextInput
                accessibilityLabel="Emergency contact relationship"
                maxLength={80}
                onChangeText={setRelationship}
                placeholder="e.g. Parent or guardian"
                style={styles.input}
                value={relationship}
              />
            </>
          ) : null}

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            accessibilityLabel="Contact phone number"
            autoComplete="tel"
            keyboardType="phone-pad"
            maxLength={32}
            onChangeText={setPhone}
            placeholder="+1 555 123 4567"
            style={styles.input}
            value={phone}
          />

          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            accessibilityLabel="Contact email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            maxLength={254}
            onChangeText={setEmail}
            placeholder="Email address"
            style={styles.input}
            value={email}
          />

          {type === "facility" ? (
            <>
              <Text style={styles.label}>Address / location</Text>
              <TextInput
                accessibilityLabel="Facility address"
                maxLength={250}
                onChangeText={setAddress}
                placeholder="Street, city, or other location details"
                style={styles.input}
                value={address}
              />
            </>
          ) : null}

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            accessibilityLabel="Contact notes"
            maxLength={500}
            multiline
            onChangeText={setNotes}
            placeholder="Additional information"
            style={[styles.input, styles.multilineInput]}
            textAlignVertical="top"
            value={notes}
          />

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void handleSave()}
            style={[styles.saveButton, saving && styles.disabledButton]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving..." : "Save contact"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => router.back()}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F7FAF9",
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    color: "#173D35",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 8,
  },
  label: {
    color: "#344943",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    color: "#243B35",
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  typeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeOption: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  selectedTypeOption: {
    backgroundColor: "#287A65",
    borderColor: "#287A65",
  },
  typeOptionText: {
    color: "#64746E",
    fontSize: 13,
  },
  selectedTypeOptionText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 12,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 12,
    marginTop: 28,
    padding: 15,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButton: {
    alignItems: "center",
    padding: 14,
  },
  cancelButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
  message: {
    color: "#71817C",
    fontSize: 15,
    padding: 24,
    textAlign: "center",
  },
  backButton: {
    alignItems: "center",
    padding: 14,
  },
  backText: {
    color: "#287A65",
    fontWeight: "700",
  },
});
