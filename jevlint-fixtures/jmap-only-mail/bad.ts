type SmtpClient = { sendMail: (message: unknown) => Promise<string> };

export function sendMail(
  client: SmtpClient,
  message: unknown,
): Promise<string> {
  return client.sendMail(message);
}
