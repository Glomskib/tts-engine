/**
 * Browser-side helpers to download pack content as markdown files.
 */

/** Trigger a file download in the browser */
export function downloadTextFile(content: string, filename: string, mimeType = 'text/markdown') {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/** Trigger a JSON download in the browser */
export function downloadJsonFile(data: unknown, filename: string) {
  downloadTextFile(JSON.stringify(data, null, 2), filename, 'application/json');
}
