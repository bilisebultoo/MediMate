import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function exportReportCsv(
  filename: string,
  contents: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("File sharing is not available on this device.");
  }

  const file = new File(Paths.cache, filename);
  file.create();
  await file.write(contents);
  await Sharing.shareAsync(file.uri, {
    dialogTitle: "Share report CSV",
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}
