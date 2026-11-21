export interface ReportService {
  createReport(userId: string, from: Date, to: Date): Promise<Uint8Array>;
}
