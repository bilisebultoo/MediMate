import { useEffect, useState } from "react";
import { Link, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import {
  getWeeklyHealthReview,
  type WeeklyHealthReview,
} from "@/services/weeklyHealthReview";

function formatDate(value: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export default function HowWasYouScreen() {
  const database = useSQLiteContext();
  const { activeProfile, isLoading: isProfileLoading } = useUserProfiles();
  const colors = useTheme();
  const [review, setReview] = useState<WeeklyHealthReview | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfile) return;
    let isCurrent = true;
    const profileId = activeProfile.id;

    void getWeeklyHealthReview(database, profileId)
      .then((result) => {
        if (!isCurrent) return;
        setReview(result);
        setLoadedProfileId(profileId);
        setError(null);
      })
      .catch((cause: unknown) => {
        console.error("Could not load weekly health review:", cause);
        if (!isCurrent) return;
        setLoadedProfileId(profileId);
        setError("The weekly review could not be loaded. Please try again.");
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeProfile, database]);

  const visibleReview =
    activeProfile?.id === loadedProfileId ? review : null;
  const assessmentTitle =
    visibleReview?.assessment === "needs_improvement"
      ? "Needs improvement"
      : visibleReview?.assessment === "tracking_on_track"
        ? "Tracking on track"
        : "Not enough information to assess";
  const assessmentDescription =
    visibleReview?.assessment === "needs_improvement"
      ? "Some medication outcomes or scheduled health entries need follow-up."
      : visibleReview?.assessment === "tracking_on_track"
        ? "No medication or scheduled-tracking gaps were found in the records reviewed."
        : "There are not enough recorded outcomes to create a useful weekly summary.";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.accent }]}>‹ MediMate AI</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>HowWasYou?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Weekly review · local records only
        </Text>

        {isProfileLoading ? (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Loading your profile…
          </Text>
        ) : !activeProfile ? (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Select a profile to view its weekly review.
          </Text>
        ) : loading || activeProfile.id !== loadedProfileId ? (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Loading your weekly review…
          </Text>
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : visibleReview ? (
          <>
            <View
              style={[
                styles.assessmentCard,
                {
                  backgroundColor:
                    visibleReview.assessment === "needs_improvement"
                      ? "#FFF4E5"
                      : colors.backgroundElement,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
                Tracking summary · week of {formatDate(visibleReview.weekStart)}
              </Text>
              <Text style={[styles.assessmentTitle, { color: colors.text }]}>
                {assessmentTitle}
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {assessmentDescription}
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Medication consistency
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              {visibleReview.medication.scheduled === 0 ? (
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  No scheduled doses were due in the records for this week.
                </Text>
              ) : (
                <>
                  <Text style={[styles.metricValue, { color: colors.accent }]}>
                    {visibleReview.medication.taken} / {visibleReview.medication.scheduled}
                  </Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    scheduled doses marked taken
                    {visibleReview.medication.adherencePercent === null
                      ? ""
                      : ` · ${visibleReview.medication.adherencePercent}%`}
                  </Text>
                  <Text style={[styles.detail, { color: colors.textSecondary }]}>
                    Missed: {visibleReview.medication.missed} · Skipped:{" "}
                    {visibleReview.medication.skipped} · No outcome recorded:{" "}
                    {visibleReview.medication.pending}
                  </Text>
                  {visibleReview.medication.byMedicine
                    .filter((medicine) => medicine.missed + medicine.skipped > 0)
                    .map((medicine) => (
                      <Text
                        key={medicine.name}
                        style={[styles.detail, { color: colors.textSecondary }]}
                      >
                        {medicine.name}: {medicine.missed} missed,{" "}
                        {medicine.skipped} skipped
                      </Text>
                    ))}
                </>
              )}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Your health observations
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {visibleReview.health.recordCount} measurement(s) recorded this
                week. Values below are listed as entered; they are not classified
                as normal or abnormal.
              </Text>
              {visibleReview.health.measurements.length === 0 ? (
                <Text style={[styles.detail, { color: colors.textSecondary }]}>
                  No health measurements were recorded this week.
                </Text>
              ) : (
                visibleReview.health.measurements.map((measurement) => (
                  <View
                    key={`${measurement.metric}:${measurement.name}`}
                    style={[styles.measurement, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.measurementName, { color: colors.text }]}>
                      {measurement.name} · {measurement.count} record(s)
                    </Text>
                    <Text style={[styles.detail, { color: colors.textSecondary }]}>
                      Earlier: {measurement.earliestValue} {measurement.earliestUnit} (
                      {formatDate(measurement.earliestAt)})
                    </Text>
                    <Text style={[styles.detail, { color: colors.textSecondary }]}>
                      Latest: {measurement.latestValue} {measurement.unit} (
                      {formatDate(measurement.latestAt)})
                    </Text>
                  </View>
                ))
              )}
              {visibleReview.health.remindersDue > 0 ? (
                <Text style={[styles.detail, { color: colors.textSecondary }]}>
                  Scheduled tracking entries: {visibleReview.health.remindersLogged}{" "}
                  of {visibleReview.health.remindersDue} matched a record.
                </Text>
              ) : null}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Suggested next steps
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              {visibleReview.recommendations.map((recommendation, index) => (
                <Text
                  key={`${index}:${recommendation}`}
                  style={[styles.body, styles.recommendation, { color: colors.textSecondary }]}
                >
                  • {recommendation}
                </Text>
              ))}
              <Text style={[styles.body, { color: colors.text }]}>
                General education only
              </Text>
              <Text style={[styles.detail, { color: colors.textSecondary }]}>
                A DASH-style eating pattern includes vegetables, fruits, whole
                grains, beans, nuts, and other nutrient-rich foods. It is not a
                personalized meal plan; dietary needs and medical conditions may
                require different advice.
              </Text>
              <Link href="https://www.nhlbi.nih.gov/health/dash-eating-plan">
                <Text style={[styles.source, { color: colors.accent }]}>
                  Source: NHLBI DASH Eating Plan
                </Text>
              </Link>
              <Text style={[styles.detail, { color: colors.textSecondary }]}>
                Regular movement can support health. Choose activities that fit
                your age, abilities, symptoms, and care plan; check with a
                healthcare professional before starting or changing activity if
                you have concerns.
              </Text>
              <Link href="https://www.who.int/news-room/fact-sheets/detail/physical-activity">
                <Text style={[styles.source, { color: colors.accent }]}>
                  Source: World Health Organization
                </Text>
              </Link>
              <Text style={[styles.detail, styles.disclaimer, { color: colors.textSecondary }]}>
                Personalized meal and activity advice, medical thresholds, and
                urgent alerts are not enabled in this offline version. This
                summary is educational and does not replace professional care.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  back: { fontSize: 15, fontWeight: "600", marginBottom: 18 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 14, marginBottom: 20, marginTop: 6 },
  message: { fontSize: 15, marginTop: 20 },
  error: { fontSize: 15, lineHeight: 22, marginTop: 20 },
  assessmentCard: { borderRadius: 16, borderWidth: 1, marginBottom: 18, padding: 18 },
  eyebrow: { fontSize: 12, fontWeight: "600" },
  assessmentTitle: { fontSize: 21, fontWeight: "700", marginTop: 8 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10, marginTop: 8 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 16, padding: 16 },
  metricValue: { fontSize: 28, fontWeight: "700" },
  detail: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  measurement: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  measurementName: { fontSize: 14, fontWeight: "700" },
  recommendation: { marginTop: 4 },
  source: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  disclaimer: { marginTop: 16 },
});
