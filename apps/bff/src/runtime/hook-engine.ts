import type { AgentMemoryRecord, FileMemoryStore, MemoryScope } from "./memory-store.js";
import type { SkillSummary } from "./skill-registry.js";

export type AgentHookEvent =
  | "before_context_load"
  | "before_tool_call"
  | "after_tool_call"
  | "before_model_call"
  | "after_model_call"
  | "after_response"
  | "on_error";

export type AgentHookPayload = {
  scope: MemoryScope;
  question?: string;
  answer?: string;
  usedSkills?: SkillSummary[];
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  error?: unknown;
};

type HookHandler = (payload: AgentHookPayload) => Promise<void> | void;

export class HookEngine {
  private readonly handlers = new Map<AgentHookEvent, HookHandler[]>();

  register(event: AgentHookEvent, handler: HookHandler): void {
    const current = this.handlers.get(event) ?? [];
    current.push(handler);
    this.handlers.set(event, current);
  }

  async run(event: AgentHookEvent, payload: AgentHookPayload): Promise<void> {
    const current = this.handlers.get(event) ?? [];
    for (const handler of current) {
      await handler(payload);
    }
  }
}

function summarizeSkills(skills: SkillSummary[] | undefined): string {
  if (!skills || skills.length === 0) {
    return "none";
  }
  return skills.map((item) => item.slug).join(", ");
}

function trimForMemory(input: string, maxLength = 320): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function redactSensitiveText(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(sk|ca|ck)_[A-Za-z0-9_-]+\b/g, "[secret]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[id]");
}

export function createDefaultHookEngine(memoryStore: FileMemoryStore): HookEngine {
  const engine = new HookEngine();

  engine.register("after_response", async (payload) => {
    if (!payload.question || !payload.answer) {
      return;
    }

    const content = trimForMemory(
      redactSensitiveText(
        `question=${payload.question}\nanswer_summary=${payload.answer}\nskills=${summarizeSkills(payload.usedSkills)}`
      )
    );
    await memoryStore.append(payload.scope, {
      kind: "interaction",
      content,
      tags: ["conversation", ...(payload.usedSkills?.map((item) => item.slug) ?? [])],
    });
  });

  engine.register("on_error", async (payload) => {
    const message =
      payload.error instanceof Error
        ? payload.error.message
        : typeof payload.error === "string"
          ? payload.error
          : "unknown runtime error";
    await memoryStore.append(payload.scope, {
      kind: "incident",
      content: trimForMemory(
        redactSensitiveText(
          `error=${message}${payload.question ? ` question_summary=${payload.question}` : ""}`
        )
      ),
      tags: ["runtime-error"],
    });
  });

  return engine;
}

export type { AgentMemoryRecord };
