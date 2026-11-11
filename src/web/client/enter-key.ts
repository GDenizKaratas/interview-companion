import type { KeyboardEvent } from "react";

// Enter saves; Shift+Enter adds a line break. Enter while composing (for example with an
// input method editor) is left alone.
export function onEnter(run: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      run();
    }
  };
}
