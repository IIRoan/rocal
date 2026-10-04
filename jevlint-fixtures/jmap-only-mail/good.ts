type StalwartJmapClient = {
  sendMessage: (session: unknown, message: unknown) => Promise<string>;
};

export function sendMail(
  client: StalwartJmapClient,
  session: unknown,
  message: unknown,
): Promise<string> {
  return client.sendMessage(session, message);
}
