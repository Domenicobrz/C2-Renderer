let onceMemory: Record<string, boolean> = {};

export function once(label: string) {
  if (onceMemory[label]) return false;

  onceMemory[label] = true;
  return true;
}
