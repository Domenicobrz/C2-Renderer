import { browser } from '$app/environment';

export function getURLParam(param: string) {
  if (browser) {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get(param);
  }

  return '';
}
