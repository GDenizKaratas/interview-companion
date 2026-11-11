import { describe, expect, it } from "vitest";
import { listenFailureMessage } from "./listen-error.ts";

function systemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`listen ${code}`), { code });
}

describe("The message when the server cannot start listening", () => {
  it("says the port is in use, that the app may already be running, and how to choose another port", () => {
    const message = listenFailureMessage(systemError("EADDRINUSE"), 3000)!;
    expect(message).toContain("Port 3000 is already in use");
    expect(message).toContain("http://localhost:3000");
    expect(message).toContain("PORT=3001");
  });

  it("says the port cannot be used when the system does not allow it", () => {
    expect(listenFailureMessage(systemError("EACCES"), 80)).toContain("Port 80 cannot be used");
  });

  it("gives no message for another failure, which is shown as it is", () => {
    expect(listenFailureMessage(new Error("something else"), 3000)).toBeUndefined();
  });
});
