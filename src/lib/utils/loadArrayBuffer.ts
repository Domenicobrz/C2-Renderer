export async function loadArrayBuffer(url: string): Promise<ArrayBuffer | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok.');
    const arrayBuffer = await response.arrayBuffer();
    return arrayBuffer;
  } catch (error) {
    console.error('There was a problem fetching the file:', error);
  }
}
