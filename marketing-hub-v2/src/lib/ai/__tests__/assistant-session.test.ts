import { describe, expect, it } from "vitest";
import {
  emptyAssistantSession,
  readAssistantSession,
  writeAssistantSession,
  clearAssistantSession,
  ASSISTANT_SESSION_KEY,
} from "@/lib/ai/assistant-session";
import {
  capAssistantReviews,
  normalizeAssistantReview,
  ASSISTANT_REVIEW_CAP,
} from "@/lib/ai/assistant-reviews";

describe("assistant-session", () => {
  it("round-trips a session through sessionStorage", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    Object.defineProperty(globalThis, "window", {
      value: { sessionStorage: storage },
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: storage,
      configurable: true,
    });

    clearAssistantSession();
    expect(readAssistantSession()).toEqual(emptyAssistantSession());

    writeAssistantSession({
      mode: "chat",
      composer: "hello",
      messages: [
        { id: "1", role: "user", content: "Add Metstrade" },
        {
          id: "2",
          role: "assistant",
          content: "Proposed",
          commandText: "Add an event Metstrade",
          reviewId: "asr_1",
          rating: "up",
        },
      ],
      attachments: [],
      draft: null,
      pendingCommand: "Add an event Metstrade",
      commandPreview: null,
    });

    expect(memory.get(ASSISTANT_SESSION_KEY)).toBeTruthy();
    const restored = readAssistantSession();
    expect(restored.composer).toBe("hello");
    expect(restored.messages).toHaveLength(2);
    expect(restored.messages[1].reviewId).toBe("asr_1");
    expect(restored.pendingCommand).toBe("Add an event Metstrade");

    clearAssistantSession();
    expect(memory.has(ASSISTANT_SESSION_KEY)).toBe(false);
  });
});

describe("assistant-reviews", () => {
  it("normalizes and caps reviews", () => {
    const row = normalizeAssistantReview({
      id: "asr_1",
      mode: "chat",
      user_prompt: "  hello  ",
      outcome: "previewed",
      rating: "down",
    });
    expect(row.user_prompt).toBe("hello");
    expect(row.outcome).toBe("previewed");
    expect(row.rating).toBe("down");

    const many = Array.from({ length: ASSISTANT_REVIEW_CAP + 5 }, (_, i) =>
      normalizeAssistantReview({
        id: `asr_${i}`,
        created_at: new Date(2026, 0, 1 + i).toISOString(),
        user_prompt: `ask ${i}`,
      })
    );
    expect(capAssistantReviews(many)).toHaveLength(ASSISTANT_REVIEW_CAP);
  });
});
