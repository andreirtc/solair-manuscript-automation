const messages: Record<string, string> = {
  AI_TIMEOUT:
    "Your AI answer exceeded the time limit. No manuscript change was applied. Choose High or Medium reasoning, narrow the request and retry.",
  AI_QUOTA:
    "Your connected account has reached an AI allowance limit. Check My AI allowance and its reset time. No other member's account was used.",
  AI_CONTEXT:
    "This request has too much context. Use fewer attachments or a smaller section, then retry.",
  AI_DISCONNECTED:
    "Your personal AI worker disconnected before the answer finished. Check the current workspace address and your connection, then retry.",
  AI_AUTH:
    "Your personal ChatGPT authorization needs attention. Check your connection in Settings, then retry.",
  AI_INVALID_RESPONSE:
    "The AI returned a response that could not be safely validated. No manuscript change was applied. Retry a smaller, specific request.",
  AI_FAILED:
    "Your personal AI request did not finish. No manuscript change was applied and no other account was used. Check My AI allowance, then retry.",
};
export class AIRequestError extends Error {
  constructor(public code: string) {
    super(messages[code] || messages.AI_FAILED);
  }
}
export function publicAIError(error: any): { code: string; message: string } {
  const text = String(error?.message || "");
  const code = messages[error?.code]
    ? error.code
    : /context.*(large|exceed)|prompt.*large/i.test(text)
      ? "AI_CONTEXT"
      : /quota|rate.?limit|usage.?limit/i.test(text)
        ? "AI_QUOTA"
        : /timed? out|timeout/i.test(text)
          ? "AI_TIMEOUT"
          : /disconnect/i.test(text)
            ? "AI_DISCONNECTED"
            : /unauthoriz|authentication|sign.in/i.test(text)
              ? "AI_AUTH"
              : error instanceof SyntaxError || error?.name === "ZodError"
                ? "AI_INVALID_RESPONSE"
                : "AI_FAILED";
  return { code, message: messages[code] };
}
