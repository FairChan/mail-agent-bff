/**
 * Composio MCP Client - 直接连接 Composio 平台，不依赖 OpenClaw Gateway
 *
 * 替代 gateway.ts，直接通过 HTTP 调用 Composio MCP Server
 * Composio MCP 使用 Streamable HTTP 2-way 传输协议
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// ========== 类型定义 ==========

export interface ComposioToolArg {
  tool_slug: string;
  arguments: Record<string, unknown>;
}

export interface ComposioMultiExecuteArgs {
  tools: ComposioToolArg[];
  connected_account_id?: string;
}

export interface ComposioToolResult {
  tool_slug?: string;
  error?: string | null;
  response?: {
    successful?: boolean;
    data?: unknown;
    error?: string | null;
  };
}

export interface ComposioMultiExecuteResult {
  successful?: boolean;
  data?: {
    results?: ComposioToolResult[];
  };
  error?: string | null;
}

export interface ComposioMcpError {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

// ========== MCP 协议常量 ==========

const MCP_PROTOCOL_VERSION = "2024-11-05";
const JSONRPC_VERSION = "2.0";

// ========== MCP JSON-RPC 消息类型 ==========

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcBatchResponse = JsonRpcResponse[];

type ServerNotification = JsonRpcNotification & {
  params?: {
    method: string;
    params?: Record<string, unknown>;
  };
};

// ========== MCP Session 类 ==========

class ComposioMcpSession {
  private apiKey: string;
  private baseUrl: string;
  private sessionId: string;
  private requestId = 0;
  private abortController: AbortController;
  private eventEmitter: EventEmitter;
  private initialized = false;
  private toolSchemaCache: unknown = null;

  constructor(apiKey: string, mcpUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = mcpUrl;
    this.sessionId = randomUUID();
    this.abortController = new AbortController();
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(0);
  }

  private nextId(): string | number {
    return ++this.requestId;
  }

  async initialize(): Promise<unknown> {
    const id = this.nextId();
    const initializeParams = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        streaming: true,
        sampling: {},
      },
      clientInfo: {
        name: "mail-agent-bff",
        version: "1.0.0",
      },
    };

    const response = await this.sendRequest({
      jsonrpc: JSONRPC_VERSION,
      id,
      method: "initialize",
      params: initializeParams,
    });

    // 发送初始化完成通知
    await this.sendNotification({
      jsonrpc: JSONRPC_VERSION,
      method: "notifications/initialized",
    });

    this.initialized = true;
    return response;
  }

  async listTools(): Promise<unknown> {
    const response = await this.sendRequest({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextId(),
      method: "tools/list",
    });
    return response;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    const response = await this.sendRequest({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextId(),
      method: "tools/call",
      params: {
        name,
        arguments: arguments_,
      },
    });
    return response;
  }

  async executeMultiExecute(args: ComposioMultiExecuteArgs): Promise<ComposioMultiExecuteResult> {
    // Composio MCP 服务器的 multi_execute 工具实现
    const response = await this.callTool("multi_execute", {
      tools: args.tools,
      connected_account_id: args.connected_account_id,
    });

    return response as ComposioMultiExecuteResult;
  }

  async searchTools(query: string): Promise<unknown> {
    const response = await this.callTool("search_tools", { query });
    return response;
  }

  async getToolSchemas(appName?: string): Promise<unknown> {
    const params: Record<string, unknown> = {};
    if (appName) {
      params["app_name"] = appName;
    }
    const response = await this.callTool("get_tool_schemas", params);
    return response;
  }

  async ping(): Promise<unknown> {
    return this.sendRequest({
      jsonrpc: JSONRPC_VERSION,
      id: this.nextId(),
      method: "ping",
    });
  }

  close(): void {
    this.abortController.abort();
    this.eventEmitter.removeAllListeners();
  }

  private async sendRequest(request: JsonRpcRequest): Promise<unknown> {
    const responseText = await this.httpPost(request);
    const parsed = JSON.parse(responseText) as JsonRpcResponse | JsonRpcBatchResponse;

    if (Array.isArray(parsed)) {
      throw new Error("Batch responses not supported");
    }

    if (parsed.error) {
      throw new ComposioApiError(
        parsed.error.code,
        parsed.error.message,
        parsed.error.data
      );
    }

    return parsed.result;
  }

  private async sendNotification(notification: JsonRpcNotification): Promise<void> {
    await this.httpPost(notification);
  }

  private async httpPost(body: JsonRpcRequest | JsonRpcNotification): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "x-api-key": this.apiKey,
          "mcp-session-id": this.sessionId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ComposioApiError(
          response.status,
          `HTTP ${response.status}: ${errorText.slice(0, 500)}`
        );
      }

      const text = await response.text();
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ========== 错误类 ==========

export class ComposioApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ComposioApiError";
  }
}

export class ComposioAuthError extends ComposioApiError {
  constructor(message: string) {
    super(401, message);
    this.name = "ComposioAuthError";
  }
}

export class ComposioToolError extends ComposioApiError {
  constructor(message: string, public toolSlug?: string) {
    super(502, message);
    this.name = "ComposioToolError";
  }
}

// ========== Composio Client ==========

export interface ComposioClientConfig {
  apiKey: string;
  mcpUrl: string;
}

export class ComposioClient {
  private session: ComposioMcpSession;
  private initialized = false;
  private config: ComposioClientConfig;

  constructor(config: ComposioClientConfig) {
    this.config = config;
    this.session = new ComposioMcpSession(config.apiKey, config.mcpUrl);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.session.initialize();
    this.initialized = true;
  }

  async multiExecute(args: ComposioMultiExecuteArgs): Promise<ComposioMultiExecuteResult> {
    await this.initialize();
    return this.session.executeMultiExecute(args);
  }

  async searchTools(query: string): Promise<unknown> {
    await this.initialize();
    return this.session.searchTools(query);
  }

  async getToolSchemas(appName?: string): Promise<unknown> {
    await this.initialize();
    return this.session.getToolSchemas(appName);
  }

  async listTools(): Promise<unknown> {
    await this.initialize();
    return this.session.listTools();
  }

  async ping(): Promise<boolean> {
    try {
      await this.session.ping();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.session.close();
  }
}

// ========== 工厂函数 ==========

export function createComposioClient(apiKey: string, mcpUrl: string): ComposioClient {
  return new ComposioClient({ apiKey, mcpUrl });
}
