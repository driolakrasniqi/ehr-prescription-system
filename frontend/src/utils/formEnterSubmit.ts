import type { KeyboardEvent } from "react";

/**
 * Submit a form when Enter is pressed in a textarea (Shift+Enter still inserts a newline).
 * Input fields keep native submit behaviour, including required-field validation.
 */
export function submitFormOnEnter(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.defaultPrevented) {
    return;
  }
  if (!(event.target instanceof HTMLTextAreaElement)) {
    return;
  }
  event.preventDefault();
  event.currentTarget.requestSubmit();
}
