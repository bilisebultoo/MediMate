export async function exportReportCsv(
  filename: string,
  contents: string,
): Promise<void> {
  const file = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const fileUrl = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = fileUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
}
