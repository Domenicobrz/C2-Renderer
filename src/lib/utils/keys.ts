export function onKey(key: string, callback: () => void) {
  window.addEventListener('keypress', (e) => {
    if (e.key == key) callback();
  });
}
