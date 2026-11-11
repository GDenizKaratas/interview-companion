import { openMcpGuide } from "./McpGuideDialog.tsx";
import { useText } from "./text.tsx";

// The two ways to let an AI model work, side by side wherever the app asks for one: an API key
// saved here, or the Interviewer's own AI application over MCP, which needs no key.
export function ConnectAi({ onAddApiKey }: { onAddApiKey: () => void }) {
  const { text } = useText();
  return (
    <span className="connect-ai">
      <button type="button" className="secondary" onClick={onAddApiKey}>
        {text.connectAi.addApiKey}
      </button>
      <span className="connect-ai-or">{text.connectAi.or}</span>
      <button type="button" className="secondary" onClick={() => window.dispatchEvent(new Event(openMcpGuide))}>
        {text.mcpGuide.open}
      </button>
    </span>
  );
}
