import { useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import {
  formatLocalDate,
  getAvailableReviewWeeks,
  getWeekStart,
  getWeeklyHealthReview,
  type AssessmentStatus,
  type MeasurementSummary,
  type WeeklyHealthReview,
} from "@/services/weeklyHealthReview";

function formatDate(value?: string | null): string {
  if (!value) return "—";
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

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} at ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function HowWasYouScreen() {
  const database = useSQLiteContext();
  const { activeProfile, isLoading: isProfileLoading } = useUserProfiles();
  const colors = useTheme();

  const [review, setReview] = useState<WeeklyHealthReview | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [availableWeeks, setAvailableWeeks] = useState<{ weekStart: string; label: string }[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const currentWeekStartKey = formatLocalDate(getWeekStart(new Date()));

  useEffect(() => {
    if (!activeProfile) return;

    let isCurrent = true;
    const profileId = activeProfile.id;
    const targetWeek = selectedWeekStart || currentWeekStartKey;

    void (async () => {
      try {
        const [weeks, result] = await Promise.all([
          getAvailableReviewWeeks(database, profileId),
          getWeeklyHealthReview(database, profileId, targetWeek, refreshIndex > 0),
        ]);
        if (!isCurrent) return;
        setAvailableWeeks(weeks);
        setReview(result);
        setSelectedWeekStart(result.weekStart);
        setLoadedProfileId(profileId);
        setError(null);
      } catch (cause: unknown) {
        console.error("Could not load weekly health review:", cause);
        if (!isCurrent) return;
        setLoadedProfileId(profileId);
        setError("The weekly review could not be loaded. Please try again.");
      } finally {
        if (isCurrent) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [activeProfile, currentWeekStartKey, database, refreshIndex, selectedWeekStart]);

  const handleSelectWeek = (weekStart: string) => {
    if (!activeProfile || weekStart === selectedWeekStart) return;
    setLoading(true);
    setSelectedWeekStart(weekStart);
  };

  const handleRefresh = () => {
    if (!activeProfile) return;
    setIsRefreshing(true);
    setRefreshIndex((prev) => prev + 1);
  };

  const navigateWeek = (direction: -1 | 1) => {
    if (!availableWeeks.length || !selectedWeekStart) return;
    const currentIndex = availableWeeks.findIndex((w) => w.weekStart === selectedWeekStart);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex - direction;
    if (nextIndex >= 0 && nextIndex < availableWeeks.length) {
      handleSelectWeek(availableWeeks[nextIndex].weekStart);
    }
  };

  const visibleReview = activeProfile?.id === loadedProfileId ? review : null;
  const isCurrentWeekSelected = selectedWeekStart === currentWeekStartKey;

  const currentWeekIndex = availableWeeks.findIndex((w) => w.weekStart === selectedWeekStart);
  const hasOlderWeek = currentWeekIndex >= 0 && currentWeekIndex < availableWeeks.length - 1;
  const hasNewerWeek = currentWeekIndex > 0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to MediMate AI"
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text style={[styles.back, { color: colors.accent }]}>‹ MediMate AI</Text>
          </Pressable>
          <View style={styles.titleRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>HowWasYou?</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Your weekly health check-in · local & private
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Refresh weekly review"
              accessibilityRole="button"
              disabled={isRefreshing || loading}
              onPress={handleRefresh}
              style={[
                styles.refreshButton,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              {isRefreshing ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Text style={[styles.refreshText, { color: colors.accent }]}>↻ Refresh</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Profile and Loading States */}
        {isProfileLoading ? (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Loading your profile…
          </Text>
        ) : !activeProfile ? (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Select a profile to view its weekly review.
          </Text>
        ) : loading && !visibleReview ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Analyzing your weekly health records…
            </Text>
          </View>
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : visibleReview ? (
          <>
            {/* Week Navigation Bar */}
            <View
              style={[
                styles.weekNavCard,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              <View style={styles.weekNavControls}>
                <Pressable
                  accessibilityLabel="Previous week"
                  accessibilityRole="button"
                  disabled={!hasOlderWeek}
                  onPress={() => navigateWeek(-1)}
                  style={[styles.weekNavArrow, { opacity: hasOlderWeek ? 1 : 0.3 }]}
                >
                  <Text style={[styles.weekNavArrowText, { color: colors.accent }]}>‹</Text>
                </Pressable>
                <View style={styles.weekDateContainer}>
                  <Text style={[styles.weekDateTitle, { color: colors.text }]}>
                    Week of {formatDate(visibleReview.weekStart)}
                  </Text>
                  <Text style={[styles.weekDateSubtitle, { color: colors.textSecondary }]}>
                    {visibleReview.weekEnd ? `to ${formatDate(visibleReview.weekEnd)}` : ""}
                    {isCurrentWeekSelected ? " (Current Week)" : ""}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Next week"
                  accessibilityRole="button"
                  disabled={!hasNewerWeek}
                  onPress={() => navigateWeek(1)}
                  style={[styles.weekNavArrow, { opacity: hasNewerWeek ? 1 : 0.3 }]}
                >
                  <Text style={[styles.weekNavArrowText, { color: colors.accent }]}>›</Text>
                </Pressable>
              </View>

              {!isCurrentWeekSelected ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleSelectWeek(currentWeekStartKey)}
                  style={[
                    styles.currentWeekChip,
                    { backgroundColor: colors.backgroundSelected, borderColor: colors.accent },
                  ]}
                >
                  <Text style={[styles.currentWeekChipText, { color: colors.accent }]}>
                    Jump to Current Week ↗
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Assessment Card */}
            <AssessmentCard colors={colors} review={visibleReview} />

            {/* Weekly Progress Comparison */}
            {visibleReview.progress ? (
              <ProgressSection colors={colors} progress={visibleReview.progress} />
            ) : null}

            {/* Medication Consistency Section */}
            <MedicationSection colors={colors} review={visibleReview} />

            {/* Health Observations Section */}
            <HealthObservationsSection colors={colors} review={visibleReview} />

            {/* What Needs Your Attention? */}
            {visibleReview.attentionItems && visibleReview.attentionItems.length > 0 ? (
              <AttentionSection colors={colors} items={visibleReview.attentionItems} />
            ) : null}

            {/* Your Meal Recommendations */}
            {visibleReview.mealRecommendations && visibleReview.mealRecommendations.length > 0 ? (
              <MealRecommendationsSection
                colors={colors}
                recommendations={visibleReview.mealRecommendations}
              />
            ) : null}

            {/* Activity Recommendations */}
            {visibleReview.activityRecommendations &&
            visibleReview.activityRecommendations.length > 0 ? (
              <ActivityRecommendationsSection
                colors={colors}
                recommendations={visibleReview.activityRecommendations}
              />
            ) : null}

            {/* Suggestions for Next Week */}
            {visibleReview.nextSteps && visibleReview.nextSteps.length > 0 ? (
              <NextStepsSection colors={colors} steps={visibleReview.nextSteps} />
            ) : null}

            {/* Medical Disclaimer Footer */}
            <View
              style={[
                styles.disclaimerCard,
                { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.disclaimerTitle, { color: colors.text }]}>
                Scientific Educational Guidance
              </Text>
              <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                HowWasYou is designed as an informative weekly companion. It analyzes
                locally recorded data without sending your health records off your device.
                Observations, meal ideas, and activity thoughts do not constitute medical
                diagnoses, prescriptions, or treatment plans. Always consult your healthcare
                provider regarding your personal targets and medication regimens.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------
// Section 3: Assessment Card
// ---------------------------------------------------------
function AssessmentCard({
  colors,
  review,
}: {
  colors: ReturnType<typeof useTheme>;
  review: WeeklyHealthReview;
}) {
  const status: AssessmentStatus = review.assessment;

  let badgeColor: string = colors.accent;
  let badgeBg: string = colors.backgroundSelected;
  let badgeText = "Normal";
  let icon = "✓";
  let explanation =
    review.assessmentReason ||
    "Available records show satisfactory medication adherence and consistent health check-ins.";

  if (status === "urgent_attention") {
    badgeColor = colors.danger;
    badgeBg = "#FEE2E2";
    badgeText = "Urgent Attention Needed";
    icon = "🚨";
    explanation =
      review.urgentWarning ||
      "A recorded health measurement requires immediate clinical evaluation. Please contact urgent medical care.";
  } else if (status === "needs_improvement") {
    badgeColor = "#D97706";
    badgeBg = "#FEF3C7";
    badgeText = "Needs Improvement";
    icon = "⚠";
    explanation =
      review.assessmentReason ||
      "Some missed medication doses or incomplete health records deserve closer follow-up.";
  } else if (status === "not_enough_information") {
    badgeColor = colors.textSecondary;
    badgeBg = colors.backgroundElement;
    badgeText = "Not Enough Information";
    icon = "ℹ";
    explanation =
      "There are not yet enough recorded medication outcomes or measurements to form a complete weekly assessment.";
  }

  return (
    <View
      style={[
        styles.card,
        styles.assessmentCard,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: status === "urgent_attention" ? colors.danger : colors.border,
        },
      ]}
    >
      <View style={styles.assessmentHeader}>
        <View style={[styles.badgePill, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgePillText, { color: badgeColor }]}>
            {icon} {badgeText}
          </Text>
        </View>
        <Text style={[styles.eyebrowText, { color: colors.textSecondary }]}>
          Weekly Assessment
        </Text>
      </View>

      <Text style={[styles.assessmentTitleText, { color: colors.text }]}>
        {status === "urgent_attention"
          ? "Immediate Attention Recommended"
          : status === "needs_improvement"
            ? "Room for Habit Improvement"
            : status === "not_enough_information"
              ? "Limited Data Available"
              : "Healthy Consistency Maintained"}
      </Text>

      <Text style={[styles.assessmentExplanation, { color: colors.textSecondary }]}>
        {explanation}
      </Text>

      <View
        style={[
          styles.caveatBanner,
          { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.caveatBannerText, { color: colors.textSecondary }]}>
          ℹ Until clinician-reviewed personalized targets are calibrated, measurements are
          observed against standard scientific references.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------
// Section 9: Progress Comparison
// ---------------------------------------------------------
function ProgressSection({
  colors,
  progress,
}: {
  colors: ReturnType<typeof useTheme>;
  progress: NonNullable<WeeklyHealthReview["progress"]>;
}) {
  const hasAdherenceDiff = progress.adherenceDiff !== null;
  const isPositiveAdherence = (progress.adherenceDiff ?? 0) >= 0;

  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Weekly Progress</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundElement, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.progressSummaryText, { color: colors.text }]}>
          {progress.summaryText}
        </Text>

        <View style={styles.progressStatsGrid}>
          <View
            style={[
              styles.progressStatBox,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.progressStatLabel, { color: colors.textSecondary }]}>
              Adherence Comparison
            </Text>
            {hasAdherenceDiff ? (
              <View style={styles.statDeltaRow}>
                <Text
                  style={[
                    styles.progressStatValue,
                    { color: isPositiveAdherence ? colors.accent : colors.danger },
                  ]}
                >
                  {isPositiveAdherence ? "▲ +" : "▼ "}
                  {progress.adherenceDiff}%
                </Text>
                <Text style={[styles.progressStatSubtext, { color: colors.textSecondary }]}>
                  vs last week ({progress.previousWeekAdherence}%)
                </Text>
              </View>
            ) : (
              <Text style={[styles.progressStatSubtext, { color: colors.textSecondary }]}>
                First recorded week
              </Text>
            )}
          </View>

          <View
            style={[
              styles.progressStatBox,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.progressStatLabel, { color: colors.textSecondary }]}>
              Health Readings Logged
            </Text>
            <View style={styles.statDeltaRow}>
              <Text style={[styles.progressStatValue, { color: colors.text }]}>
                {progress.recordsCountDiff >= 0 ? "+" : ""}
                {progress.recordsCountDiff}
              </Text>
              <Text style={[styles.progressStatSubtext, { color: colors.textSecondary }]}>
                vs last week ({progress.previousWeekRecordsCount})
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------
// Section 4: Medication Consistency
// ---------------------------------------------------------
function MedicationSection({
  colors,
  review,
}: {
  colors: ReturnType<typeof useTheme>;
  review: WeeklyHealthReview;
}) {
  const { medication } = review;
  const adherence = medication.adherencePercent;
  const scheduled = medication.scheduled;

  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Medication Consistency</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundElement, borderColor: colors.border },
        ]}
      >
        {scheduled === 0 ? (
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            No scheduled medication doses were recorded for this week.
          </Text>
        ) : (
          <>
            <View style={styles.adherenceHeroRow}>
              <View>
                <Text style={[styles.adherenceHeroValue, { color: colors.accent }]}>
                  {adherence !== null ? `${adherence}%` : "—"}
                </Text>
                <Text style={[styles.adherenceHeroLabel, { color: colors.textSecondary }]}>
                  Weekly Adherence Rate
                </Text>
              </View>
              <View style={styles.adherenceFractionContainer}>
                <Text style={[styles.adherenceFractionValue, { color: colors.text }]}>
                  {medication.taken} / {scheduled}
                </Text>
                <Text style={[styles.adherenceFractionLabel, { color: colors.textSecondary }]}>
                  doses taken
                </Text>
              </View>
            </View>

            {/* Adherence Progress Bar */}
            <View
              style={[
                styles.progressBarTrack,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${Math.min(100, Math.max(0, adherence ?? 0))}%`,
                  },
                ]}
              />
            </View>

            {/* Counters Grid */}
            <View style={styles.countersRow}>
              <View style={[styles.counterBox, { backgroundColor: colors.backgroundSelected }]}>
                <Text style={[styles.counterNum, { color: colors.accent }]}>
                  {medication.taken}
                </Text>
                <Text style={[styles.counterLabel, { color: colors.accent }]}>Taken</Text>
              </View>
              <View style={[styles.counterBox, { backgroundColor: "#FEE2E2" }]}>
                <Text style={[styles.counterNum, { color: colors.danger }]}>
                  {medication.missed}
                </Text>
                <Text style={[styles.counterLabel, { color: colors.danger }]}>Missed</Text>
              </View>
              <View style={[styles.counterBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.counterNum, { color: colors.textSecondary }]}>
                  {medication.pending}
                </Text>
                <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Pending</Text>
              </View>
            </View>

            {/* Missed Patterns */}
            {medication.missedPatterns && medication.missedPatterns.length > 0 ? (
              <View
                style={[
                  styles.patternAlertBox,
                  { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
                ]}
              >
                <Text style={styles.patternAlertTitle}>Missed Dose Patterns:</Text>
                {medication.missedPatterns.map((pat, idx) => (
                  <Text key={idx} style={styles.patternAlertText}>
                    • {pat}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Breakdown by Medicine */}
            {medication.byMedicine.length > 0 ? (
              <View style={styles.medicineList}>
                <Text style={[styles.subheadingText, { color: colors.text }]}>
                  Medication Breakdown
                </Text>
                {medication.byMedicine.map((med) => {
                  const medAdherence =
                    med.scheduled > 0 ? Math.round((med.taken / med.scheduled) * 100) : 0;
                  return (
                    <View
                      key={med.name}
                      style={[styles.medicineRow, { borderColor: colors.border }]}
                    >
                      <View style={styles.medicineInfoCol}>
                        <Text style={[styles.medicineNameText, { color: colors.text }]}>
                          {med.name}
                        </Text>
                        <Text style={[styles.medicineDetailText, { color: colors.textSecondary }]}>
                          {med.taken} of {med.scheduled} taken · {med.missed} missed
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.medAdherenceBadge,
                          {
                            backgroundColor:
                              medAdherence >= 80 ? colors.backgroundSelected : "#FEF3C7",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.medAdherenceBadgeText,
                            { color: medAdherence >= 80 ? colors.accent : "#D97706" },
                          ]}
                        >
                          {medAdherence}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Text style={[styles.safeCompanionNote, { color: colors.textSecondary }]}>
              💡 Companion Note: Consistent schedules help medicines work as intended. If you
              experienced side effects or scheduling challenges, discuss them with your
              pharmacist or prescriber. Do not take extra doses to compensate for missed doses.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------
// Section 5: Health Observations
// ---------------------------------------------------------
function HealthObservationsSection({
  colors,
  review,
}: {
  colors: ReturnType<typeof useTheme>;
  review: WeeklyHealthReview;
}) {
  const { measurements, recordCount, remindersDue, remindersLogged } = review.health;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Observations</Text>
        <View
          style={[
            styles.recordCountPill,
            { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.recordCountText, { color: colors.accent }]}>
            {recordCount} total entries
          </Text>
        </View>
      </View>

      {remindersDue > 0 ? (
        <View
          style={[
            styles.reminderSummaryNotice,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.reminderNoticeText, { color: colors.textSecondary }]}>
            Scheduled Reminders: {remindersLogged} of {remindersDue} completed this week.
          </Text>
        </View>
      ) : null}

      {measurements.length === 0 ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            No health measurements recorded during this week. Logging your blood pressure,
            blood sugar, heart rate, or temperature regularly enables trend analysis.
          </Text>
        </View>
      ) : (
        measurements.map((measurement) => (
          <MeasurementCard key={measurement.name} colors={colors} measurement={measurement} />
        ))
      )}
    </View>
  );
}

function MeasurementCard({
  colors,
  measurement,
}: {
  colors: ReturnType<typeof useTheme>;
  measurement: MeasurementSummary;
}) {
  const trend = measurement.trend || "insufficient_data";
  const trendIcon =
    trend === "rising"
      ? "↑"
      : trend === "falling"
        ? "↓"
        : trend === "stable"
          ? "→"
          : "•";
  const trendColor =
    trend === "rising"
      ? colors.danger
      : trend === "falling"
        ? colors.accent
        : colors.textSecondary;

  return (
    <View
      style={[
        styles.card,
        styles.measurementCard,
        { backgroundColor: colors.backgroundElement, borderColor: colors.border },
      ]}
    >
      <View style={styles.measurementHeaderRow}>
        <View>
          <Text style={[styles.measurementMetricTitle, { color: colors.text }]}>
            {measurement.name}
          </Text>
          <Text style={[styles.measurementCountSub, { color: colors.textSecondary }]}>
            {measurement.count} reading(s) this week
          </Text>
        </View>
        <View
          style={[
            styles.trendBadge,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.trendBadgeIcon, { color: trendColor }]}>{trendIcon}</Text>
          <Text style={[styles.trendBadgeLabel, { color: colors.textSecondary }]}>
            {measurement.trendLabel || "Recorded entries"}
          </Text>
        </View>
      </View>

      <View style={styles.readingsComparisonRow}>
        <View
          style={[
            styles.readingBox,
            { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.readingBoxLabel, { color: colors.accent }]}>Latest Reading</Text>
          <Text style={[styles.readingBoxValue, { color: colors.text }]}>
            {measurement.latestValue} {measurement.unit}
          </Text>
          <Text style={[styles.readingBoxTime, { color: colors.textSecondary }]}>
            {formatDateTime(measurement.latestAt)}
          </Text>
        </View>

        {measurement.count > 1 ? (
          <View
            style={[
              styles.readingBox,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.readingBoxLabel, { color: colors.textSecondary }]}>
              Earlier in Week
            </Text>
            <Text style={[styles.readingBoxValue, { color: colors.textSecondary }]}>
              {measurement.earliestValue} {measurement.earliestUnit}
            </Text>
            <Text style={[styles.readingBoxTime, { color: colors.textSecondary }]}>
              {formatDateTime(measurement.earliestAt)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Mini Visual Bar Trend */}
      {measurement.readings && measurement.readings.length > 1 ? (
        <View style={styles.miniSparklineSection}>
          <Text style={[styles.sparklineTitle, { color: colors.textSecondary }]}>
            Weekly Reading Sequence:
          </Text>
          <View style={styles.sparklineBarsRow}>
            {measurement.readings.map((reading, index) => (
              <View key={index} style={styles.sparklineCol}>
                <View
                  style={[
                    styles.sparklineBar,
                    {
                      backgroundColor:
                        index === measurement.readings!.length - 1
                          ? colors.accent
                          : colors.border,
                    },
                  ]}
                />
                <Text style={[styles.sparklineBarVal, { color: colors.textSecondary }]}>
                  {reading.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Reference Context */}
      {measurement.referenceGuidance ? (
        <View
          style={[
            styles.referenceBox,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.referenceTitle, { color: colors.textSecondary }]}>
            Clinical Reference Standard:
          </Text>
          <Text style={[styles.referenceBody, { color: colors.textSecondary }]}>
            {measurement.referenceGuidance}
          </Text>
        </View>
      ) : null}

      {/* Data Sufficiency Tag */}
      <View style={styles.sufficiencyRow}>
        <Text
          style={[
            styles.sufficiencyText,
            { color: measurement.isSufficientData ? colors.accent : "#D97706" },
          ]}
        >
          {measurement.isSufficientData
            ? "✓ Sufficient weekly data for trend review"
            : "ℹ Limited data — log 2–3 entries per week for dependable trend evaluation"}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------
// Section 8: What Needs Your Attention?
// ---------------------------------------------------------
function AttentionSection({
  colors,
  items,
}: {
  colors: ReturnType<typeof useTheme>;
  items: NonNullable<WeeklyHealthReview["attentionItems"]>;
}) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        What Needs Your Attention?
      </Text>
      {items.map((item, idx) => {
        const isUrgent = item.severity === "urgent";
        const isWarning = item.severity === "warning";
        const borderColor = isUrgent
          ? colors.danger
          : isWarning
            ? "#D97706"
            : colors.border;
        const icon = isUrgent ? "🚨" : isWarning ? "⚠️" : "💡";

        return (
          <View
            key={idx}
            style={[
              styles.card,
              styles.attentionCard,
              { backgroundColor: colors.backgroundElement, borderColor },
            ]}
          >
            <View style={styles.attentionHeader}>
              <Text style={styles.attentionIcon}>{icon}</Text>
              <Text style={[styles.attentionTitle, { color: colors.text }]}>{item.title}</Text>
            </View>
            <Text style={[styles.attentionDesc, { color: colors.textSecondary }]}>
              {item.description}
            </Text>
            <View
              style={[
                styles.attentionActionBox,
                { backgroundColor: colors.backgroundSelected },
              ]}
            >
              <Text style={[styles.attentionActionText, { color: colors.accent }]}>
                Action: {item.action}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------
// Section 6: Personalized Meal Recommendations
// ---------------------------------------------------------
function MealRecommendationsSection({
  colors,
  recommendations,
}: {
  colors: ReturnType<typeof useTheme>;
  recommendations: NonNullable<WeeklyHealthReview["mealRecommendations"]>;
}) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Your Meal Recommendations
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Evidence-based nutrition concepts tailored to the metrics and records you log.
      </Text>

      {recommendations.map((meal, index) => (
        <View
          key={index}
          style={[
            styles.card,
            styles.recommendationCard,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.recTitleText, { color: colors.text }]}>🥗 {meal.title}</Text>
          <Text style={[styles.recRationale, { color: colors.textSecondary }]}>
            {meal.rationale}
          </Text>

          <View style={styles.foodPillSection}>
            <Text style={[styles.foodPillLabel, { color: colors.accent }]}>
              Recommended Food Choices:
            </Text>
            <View style={styles.pillWrap}>
              {meal.recommendedFoods.map((food, fIdx) => (
                <View
                  key={fIdx}
                  style={[styles.foodPill, { backgroundColor: colors.backgroundSelected }]}
                >
                  <Text style={[styles.foodPillText, { color: colors.accent }]}>✓ {food}</Text>
                </View>
              ))}
            </View>
          </View>

          {meal.foodsToDiscuss.length > 0 ? (
            <View style={styles.foodPillSection}>
              <Text style={[styles.foodPillLabel, { color: "#D97706" }]}>
                Foods to Limit or Discuss:
              </Text>
              <View style={styles.pillWrap}>
                {meal.foodsToDiscuss.map((food, fIdx) => (
                  <View key={fIdx} style={[styles.foodPill, { backgroundColor: "#FEF3C7" }]}>
                    <Text style={[styles.foodPillText, { color: "#D97706" }]}>• {food}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {meal.sourceUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(meal.sourceUrl!)}
              style={styles.sourceLink}
            >
              <Text style={[styles.sourceLinkText, { color: colors.accent }]}>
                Scientific Reference: {meal.scientificSource} ↗
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.sourcePlainText, { color: colors.textSecondary }]}>
              Reference: {meal.scientificSource}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------
// Section 7: Recommended Physical Activities
// ---------------------------------------------------------
function ActivityRecommendationsSection({
  colors,
  recommendations,
}: {
  colors: ReturnType<typeof useTheme>;
  recommendations: NonNullable<WeeklyHealthReview["activityRecommendations"]>;
}) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Activity Recommendations
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Safe, progressive movements to support circulation and functional vitality.
      </Text>

      {recommendations.map((activity, index) => (
        <View
          key={index}
          style={[
            styles.card,
            styles.recommendationCard,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <View style={styles.activityHeaderRow}>
            <Text style={[styles.activityTitleText, { color: colors.text }]}>
              🏃 {activity.title}
            </Text>
            <View
              style={[
                styles.intensityBadge,
                { backgroundColor: colors.backgroundSelected },
              ]}
            >
              <Text style={[styles.intensityBadgeText, { color: colors.accent }]}>
                {activity.intensity.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={[styles.recRationale, { color: colors.textSecondary }]}>
            {activity.rationale}
          </Text>

          <View style={styles.activityBulletList}>
            <Text style={[styles.activityBulletTitle, { color: colors.text }]}>
              Suggested Movements:
            </Text>
            {activity.suggestedActivities.map((act, aIdx) => (
              <Text key={aIdx} style={[styles.activityBulletItem, { color: colors.textSecondary }]}>
                • {act}
              </Text>
            ))}
          </View>

          <View
            style={[
              styles.precautionsBox,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.precautionsTitle, { color: colors.text }]}>
              Safety Precautions:
            </Text>
            <Text style={[styles.precautionsText, { color: colors.textSecondary }]}>
              {activity.precautions}
            </Text>
          </View>

          {activity.sourceUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(activity.sourceUrl!)}
              style={styles.sourceLink}
            >
              <Text style={[styles.sourceLinkText, { color: colors.accent }]}>
                Evidence Source: {activity.scientificSource} ↗
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.sourcePlainText, { color: colors.textSecondary }]}>
              Source: {activity.scientificSource}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------
// Section 8: Suggestions for Next Week
// ---------------------------------------------------------
function NextStepsSection({
  colors,
  steps,
}: {
  colors: ReturnType<typeof useTheme>;
  steps: string[];
}) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Suggestions for Next Week
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundElement, borderColor: colors.border },
        ]}
      >
        {steps.map((step, idx) => (
          <View key={idx} style={styles.nextStepRow}>
            <View
              style={[styles.stepNumberCircle, { backgroundColor: colors.backgroundSelected }]}
            >
              <Text style={[styles.stepNumberText, { color: colors.accent }]}>
                {idx + 1}
              </Text>
            </View>
            <Text style={[styles.nextStepText, { color: colors.text }]}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 18, paddingBottom: 40 },
  header: { marginBottom: 16 },
  back: { fontSize: 15, fontWeight: "600", marginBottom: 12 },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  refreshButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshText: { fontSize: 13, fontWeight: "700" },
  message: { fontSize: 15, lineHeight: 22, marginTop: 20, textAlign: "center" },
  error: { fontSize: 15, lineHeight: 22, marginTop: 20, textAlign: "center" },
  loadingContainer: { alignItems: "center", paddingVertical: 40 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  sectionContainer: { marginTop: 8 },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 19, fontWeight: "700", marginBottom: 8, marginTop: 8 },
  sectionSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  bodyText: { fontSize: 14, lineHeight: 20 },
  subheadingText: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  weekNavCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  weekNavControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekNavArrow: {
    alignItems: "center",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  weekNavArrowText: { fontSize: 24, fontWeight: "700" },
  weekDateContainer: { alignItems: "center", flex: 1 },
  weekDateTitle: { fontSize: 15, fontWeight: "700" },
  weekDateSubtitle: { fontSize: 12, marginTop: 2 },
  currentWeekChip: {
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentWeekChipText: { fontSize: 11, fontWeight: "700" },
  assessmentCard: {
    borderLeftWidth: 5,
  },
  assessmentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badgePill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgePillText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  eyebrowText: { fontSize: 12, fontWeight: "600" },
  assessmentTitleText: { fontSize: 21, fontWeight: "700", marginBottom: 8 },
  assessmentExplanation: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  caveatBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  caveatBannerText: { fontSize: 12, lineHeight: 17 },
  progressSummaryText: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  progressStatsGrid: { flexDirection: "row", gap: 10 },
  progressStatBox: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  progressStatLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  statDeltaRow: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 4 },
  progressStatValue: { fontSize: 18, fontWeight: "800" },
  progressStatSubtext: { fontSize: 11 },
  adherenceHeroRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  adherenceHeroValue: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  adherenceHeroLabel: { fontSize: 12, fontWeight: "600" },
  adherenceFractionContainer: { alignItems: "flex-end" },
  adherenceFractionValue: { fontSize: 20, fontWeight: "700" },
  adherenceFractionLabel: { fontSize: 12 },
  progressBarTrack: {
    borderRadius: 8,
    borderWidth: 1,
    height: 12,
    marginBottom: 16,
    overflow: "hidden",
    width: "100%",
  },
  progressBarFill: {
    borderRadius: 6,
    height: "100%",
  },
  countersRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  counterBox: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    paddingVertical: 10,
  },
  counterNum: { fontSize: 18, fontWeight: "800" },
  counterLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  patternAlertBox: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  patternAlertTitle: { color: "#92400E", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  patternAlertText: { color: "#92400E", fontSize: 12, lineHeight: 18 },
  medicineList: { marginBottom: 12 },
  medicineRow: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  medicineInfoCol: { flex: 1, marginRight: 8 },
  medicineNameText: { fontSize: 14, fontWeight: "700" },
  medicineDetailText: { fontSize: 12, marginTop: 2 },
  medAdherenceBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  medAdherenceBadgeText: { fontSize: 12, fontWeight: "700" },
  safeCompanionNote: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  recordCountPill: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recordCountText: { fontSize: 12, fontWeight: "700" },
  reminderSummaryNotice: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 10,
  },
  reminderNoticeText: { fontSize: 12, lineHeight: 17 },
  measurementCard: { marginBottom: 14 },
  measurementHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  measurementMetricTitle: { fontSize: 17, fontWeight: "700" },
  measurementCountSub: { fontSize: 12, marginTop: 2 },
  trendBadge: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trendBadgeIcon: { fontSize: 14, fontWeight: "800" },
  trendBadgeLabel: { fontSize: 11, fontWeight: "600" },
  readingsComparisonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  readingBox: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  readingBoxLabel: { fontSize: 11, fontWeight: "700" },
  readingBoxValue: { fontSize: 18, fontWeight: "800", marginVertical: 3 },
  readingBoxTime: { fontSize: 10 },
  miniSparklineSection: { marginBottom: 12 },
  sparklineTitle: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  sparklineBarsRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    paddingTop: 4,
  },
  sparklineCol: { alignItems: "center" },
  sparklineBar: {
    borderRadius: 3,
    height: 24,
    width: 14,
  },
  sparklineBarVal: { fontSize: 10, marginTop: 3 },
  referenceBox: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  referenceTitle: { fontSize: 11, fontWeight: "700", marginBottom: 3 },
  referenceBody: { fontSize: 11, lineHeight: 16 },
  sufficiencyRow: { marginTop: 4 },
  sufficiencyText: { fontSize: 11, fontWeight: "600" },
  attentionCard: { borderLeftWidth: 4, marginBottom: 12 },
  attentionHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 6 },
  attentionIcon: { fontSize: 16 },
  attentionTitle: { fontSize: 15, fontWeight: "700" },
  attentionDesc: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  attentionActionBox: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attentionActionText: { fontSize: 12, fontWeight: "600" },
  recommendationCard: { marginBottom: 14 },
  recTitleText: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  recRationale: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  foodPillSection: { marginBottom: 10 },
  foodPillLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  foodPill: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  foodPillText: { fontSize: 12, fontWeight: "600" },
  activityHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  activityTitleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  intensityBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  intensityBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  activityBulletList: { marginBottom: 10 },
  activityBulletTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  activityBulletItem: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  precautionsBox: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  precautionsTitle: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  precautionsText: { fontSize: 11, lineHeight: 16 },
  sourceLink: { marginTop: 6 },
  sourceLinkText: { fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  sourcePlainText: { fontSize: 11, marginTop: 6 },
  nextStepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  stepNumberCircle: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepNumberText: { fontSize: 13, fontWeight: "800" },
  nextStepText: { flex: 1, fontSize: 14, lineHeight: 20, paddingTop: 3 },
  disclaimerCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    padding: 14,
  },
  disclaimerTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  disclaimerText: { fontSize: 12, lineHeight: 18 },
});
