// used to await a javascript tick:
// await tick();
export function tick() {
  return new Promise((res) => {
    setTimeout(res, 5);
  });
}
