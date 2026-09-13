// Reading from and writing to elements on the live page. Everything here
// touches `document`, so none of it can run in a service worker — that is
// the whole point of the page/ vs core/ split.

export function readText(selector: string): string {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`No element for "${selector}"`);
  const text = (el as HTMLInputElement).value ?? el.textContent?.trim() ?? "";
  if (!text) throw new Error(`Element "${selector}" is empty`);
  return text;
}

// Assigning el.value directly does not notify React — it overrides the
// native setter, so React's state never learns the value changed and
// reverts it on the next render. Use the prototype's native setter instead.
export function writeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}