export type HealthReminderWebInputProps = {
  accessibilityLabel: string;
  backgroundColor: string;
  borderColor: string;
  color: string;
  mode: "date" | "time";
  onChangeText: (value: string) => void;
  value: string;
};
