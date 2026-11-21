import type { HealthReminderWebInputProps } from "./health-reminder-web-input.types";

export default function HealthReminderWebInput({
  accessibilityLabel,
  backgroundColor,
  borderColor,
  color,
  mode,
  onChangeText,
  value,
}: HealthReminderWebInputProps) {
  return (
    <input
      aria-label={accessibilityLabel}
      onChange={(event) => onChangeText(event.currentTarget.value)}
      style={{
        backgroundColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        boxSizing: "border-box",
        color,
        font: "inherit",
        minHeight: 48,
        padding: "0 12px",
        width: "100%",
      }}
      type={mode}
      value={value}
    />
  );
}
