import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const {
  ensureAdapterExecutionTargetCommandResolvable,
  ensureAdapterExecutionTargetRuntimeCommandInstalled,
  executeGeminiAcp,
  readPaperclipRuntimeSkillEntries,
  resolveAdapterExecutionTargetCommandForLogs,
  runAdapterExecutionTargetProcess,
} = vi.hoisted(() => ({
  ensureAdapterExecutionTargetCommandResolvable: vi.fn(async () => undefined),
  ensureAdapterExecutionTargetRuntimeCommandInstalled: vi.fn(async () => undefined),
  executeGeminiAcp: vi.fn(async () => {
    throw new Error('Not used in this test');
  }),
  readPaperclipRuntimeSkillEntries: vi.fn(async () => []),
  resolveAdapterExecutionTargetCommandForLogs: vi.fn(async () => "agy"),
  runAdapterExecutionTargetProcess: vi.fn(async () => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: [
      JSON.stringify({ type: "init", session_id: "agy-session-1" }),
      JSON.stringify({ type: "message", role: "assistant", content: "hello" }),
      JSON.stringify({
        type: "result",
        status: "success",
        stats: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
      }),
    ].join("\n"),
    stderr: "",
    pid: 123,
    startedAt: new Date().toISOString(),
  })),
}));

vi.mock("./acp.js", () => ({
  createGeminiAcpExecutor: () => executeGeminiAcp,
  resolveGeminiExecutionEngineForRun: async (ctx: { config: Record<string, unknown> }) => ({ engine: "cli", explicit: true }),
}));

vi.mock("@paperclipai/adapter-utils/execution-target", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/adapter-utils/execution-target")>(
    "@paperclipai/adapter-utils/execution-target",
  );
  return {
    ...actual,
    ensureAdapterExecutionTargetCommandResolvable,
    ensureAdapterExecutionTargetRuntimeCommandInstalled,
    resolveAdapterExecutionTargetCommandForLogs,
    runAdapterExecutionTargetProcess,
  };
});

vi.mock("@paperclipai/adapter-utils/server-utils", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/adapter-utils/server-utils")>(
    "@paperclipai/adapter-utils/server-utils",
  );
  return {
    ...actual,
    readPaperclipRuntimeSkillEntries,
  };
});

import { execute } from "./execute.js";

function buildContext(config: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Antigravity Coder",
      adapterType: "gemini_local",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {
      env: { GEMINI_API_KEY: "test-key" },
      ...config,
    },
    context: {},
    onLog: vi.fn(async () => {}),
  };
}

describe("agy command execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not inject --dangerously-skip-permissions by default when command is agy", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "agy-test-"));
    try {
      const ctx = buildContext({ engine: "cli", command: "agy", cwd });
      await execute(ctx as never);

      expect(runAdapterExecutionTargetProcess).toHaveBeenCalledTimes(1);
      const args = vi.mocked(runAdapterExecutionTargetProcess).mock.calls[0][3];
      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args).not.toContain("--approval-mode");
      expect(args).not.toContain("yolo");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("injects --dangerously-skip-permissions when command is agy and agyDangerouslySkipPermissions is true", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "agy-test-"));
    try {
      const ctx = buildContext({ engine: "cli", command: "agy", agyDangerouslySkipPermissions: true, cwd });
      await execute(ctx as never);

      expect(runAdapterExecutionTargetProcess).toHaveBeenCalledTimes(1);
      const args = vi.mocked(runAdapterExecutionTargetProcess).mock.calls[0][3];
      expect(args).toContain("--dangerously-skip-permissions");
      expect(args).not.toContain("--approval-mode");
      expect(args).not.toContain("yolo");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
