type MailConfig = { enabled: boolean };
type HttpClient = { get: <T>(path: string) => Promise<T> };

export function getMailConfig(client: HttpClient): Promise<MailConfig> {
  return client.get<MailConfig>("/api/mail/config");
}
