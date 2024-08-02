export function saveArrayBufferLocally(data: ArrayBuffer, fileName: string) {
  // Convert the ArrayBuffer to a Blob
  const blob = new Blob([data], { type: 'application/octet-stream' });

  // Create a temporary link to trigger the download
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = fileName;

  // Append the link to the document, trigger the click, and then remove it
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
