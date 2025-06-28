// A utility function to find changed keys between two objects, including nested ones.
// e.g., returns ['BOUNCES_COUNT', 'SimplePathTrace.MIS_TYPE']
export function getChangedKeys(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  prefix = ''
): string[] {
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changedKeys: string[] = [];

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const oldValue = oldObj[key];
    const newValue = newObj[key];

    if (
      typeof oldValue === 'object' &&
      oldValue !== null &&
      typeof newValue === 'object' &&
      newValue !== null &&
      !Array.isArray(oldValue) &&
      !Array.isArray(newValue)
    ) {
      // Recurse into nested objects
      const nestedChanges = getChangedKeys(oldValue, newValue, fullKey);
      changedKeys.push(...nestedChanges);
    } else if (oldValue !== newValue) {
      // Primitive values are different
      changedKeys.push(fullKey);
    }
  }

  return changedKeys;
}
