export function renderEmail(html: string) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
