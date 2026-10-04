declare function processEmailHtml(input: {
  html: string;
  blockRemoteImages: boolean;
}): string;
declare function buildEmailHtmlDocument(input: {
  processedHtml: string;
}): string;

export function renderEmail(html: string) {
  const processedHtml = processEmailHtml({
    html,
    blockRemoteImages: true,
  });
  return (
    <iframe
      srcDoc={buildEmailHtmlDocument({ processedHtml })}
      sandbox=""
      referrerPolicy="no-referrer"
    />
  );
}
