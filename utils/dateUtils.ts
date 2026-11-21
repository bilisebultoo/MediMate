export function formatDate(date: Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale).format(date);
}
