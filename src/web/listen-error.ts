// A plain message for the two usual reasons the server cannot listen, instead of a stack trace:
// the port is taken (most often because the app is already running in another window), or the
// system does not allow it. Any other failure gives undefined and is shown as it is.
export function listenFailureMessage(error: unknown, port: number): string | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EADDRINUSE") {
    return [
      `Port ${port} is already in use, so Interview Companion could not start.`,
      `It may already be running: open http://localhost:${port} in your browser.`,
      `Otherwise, close the other program or start on another port, for example PORT=${port + 1} npm start (in Windows PowerShell: $env:PORT=${port + 1}; npm start).`,
    ].join("\n");
  }
  if (code === "EACCES") {
    return `Port ${port} cannot be used on this computer. Start on another port, for example PORT=3000 npm start.`;
  }
  return undefined;
}
