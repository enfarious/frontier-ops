import { useState, useRef, useEffect, useCallback } from "react";
import {
  Flex,
  Text,
  TextField,
  Button,
  IconButton,
  Badge,
  Card,
  Dialog,
  Separator,
  Select,
  ScrollArea,
} from "@radix-ui/themes";
import {
  chatCompletion,
  loadLLMConfig,
  saveLLMConfig,
  testConnection,
  type ChatMessage,
  type LLMConfig,
  type ModelInfo,
} from "./llm-client";
import { MISSION_CONTROL_TOOLS, buildSystemPrompt } from "./tools";
import {
  executeTool,
  type ToolExecutorContext,
  type AssemblyData,
  type PendingAction,
} from "./tool-executor";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

/** Displayed message in the chat UI */
interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool-result";
  content: string;
  pending?: boolean;
  pendingAction?: PendingAction;
  actionExecuted?: boolean;
}

const CHAT_HISTORY_KEY = "frontier-ops-mission-control-chat";
const CHAT_MESSAGES_KEY = "frontier-ops-mission-control-messages";

function loadPersistedMessages(): DisplayMessage[] {
  try {
    const saved = localStorage.getItem(CHAT_MESSAGES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [{ id: "welcome", role: "system", content: "Mission Control online. How can I help, Commander?" }];
}

function loadPersistedHistory(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(CHAT_HISTORY_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

export default function MissionControlPage() {
  const account = useCurrentAccount();
  const [messages, setMessages] = useState<DisplayMessage[]>(loadPersistedMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [config, setConfig] = useState<LLMConfig>(loadLLMConfig);
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelDetails, setModelDetails] = useState<ModelInfo[]>([]);

  // Auto-open settings if no LLM has been configured yet
  const hasUserConfig = !!localStorage.getItem("frontier-ops-llm-config");
  const [showSettings, setShowSettings] = useState(!hasUserConfig);

  // Chat history for the LLM (not display messages)
  const chatHistory = useRef<ChatMessage[]>(loadPersistedHistory());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist messages and chat history when they change
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory.current));
    } catch {}
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Build tool executor context from app state
  const buildContext = useCallback((): ToolExecutorContext => {
    // Load assemblies from localStorage cache
    const assemblies: AssemblyData[] = [];

    // Load from the character assemblies cache
    try {
      const cached = localStorage.getItem("frontier-ops-assemblies-cache");
      if (cached) {
        const data = JSON.parse(cached);
        for (const a of data) {
          assemblies.push({
            id: a.id,
            itemId: a.itemId ?? String(a.typeId),
            name: a.name ?? "",
            typeId: a.typeId,
            state: a.state,
            moveType: a.moveType ?? "",
            ownerCapId: a.ownerCapId,
            energySourceId: a.energySourceId,
            fuel: a.fuel,
            energySource: a.energySource,
            connectedAssemblyIds: a.connectedAssemblyIds,
          });
        }
      }
    } catch {}

    // Load contacts
    let contacts: ToolExecutorContext["contacts"] = [];
    try {
      const c = localStorage.getItem("frontier-ops-contacts");
      if (c) contacts = JSON.parse(c);
    } catch {}

    // Load roles
    let roles: ToolExecutorContext["roles"] = [];
    try {
      const r = localStorage.getItem("frontier-ops-roles");
      if (r) roles = JSON.parse(r);
    } catch {}

    // Load killmails
    let killmails: ToolExecutorContext["killmails"] = [];
    try {
      const k = localStorage.getItem("frontier-ops-killmails-cache");
      if (k) killmails = JSON.parse(k);
    } catch {}

    // Solar systems (too large for full context, provide lookup map)
    const solarSystems = new Map<number, { id: number; name: string; x: number; y: number; z: number }>();

    return { assemblies, walletAddress: account?.address, contacts, roles, killmails, solarSystems };
  }, [account]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    const userMsgId = `user-${Date.now()}`;

    // Add user message to display
    setMessages(prev => [...prev, { id: userMsgId, role: "user", content: text }]);

    // Add to chat history
    if (chatHistory.current.length === 0) {
      // Add system prompt on first message
      const ctx = buildContext();
      chatHistory.current.push({
        role: "system",
        content: buildSystemPrompt({
          characterName: "Enfarious Krividus", // TODO: get from app state
          tribeId: 1000167,
          walletAddress: account?.address,
          assemblyCount: ctx.assemblies.length,
        }),
      });
    }
    chatHistory.current.push({ role: "user", content: text });

    setIsStreaming(true);

    // Create a streaming assistant message
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", pending: true },
    ]);

    const processResponse = async () => {
      const ctx = buildContext();

      await new Promise<void>((resolve) => {
        chatCompletion(
          chatHistory.current,
          MISSION_CONTROL_TOOLS,
          {
            onToken: (token) => {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + token }
                    : m,
                ),
              );
            },
            onToolCall: (_tc) => {
              // Tool calls are handled in onDone
            },
            onDone: async (fullMsg) => {
              // Add assistant message to history
              chatHistory.current.push(fullMsg);

              if (fullMsg.tool_calls && fullMsg.tool_calls.length > 0) {
                // Execute tool calls
                for (const tc of fullMsg.tool_calls) {
                  const { result, pendingAction } = await executeTool(tc, ctx);

                  // Add tool result to display
                  const toolMsgId = `tool-${Date.now()}-${tc.id}`;
                  setMessages(prev => {
                    // Update assistant message to remove pending
                    const updated = prev.map(m =>
                      m.id === assistantMsgId ? { ...m, pending: false } : m,
                    );
                    return [
                      ...updated,
                      {
                        id: toolMsgId,
                        role: "tool-result" as const,
                        content: result,
                        pendingAction,
                      },
                    ];
                  });

                  // Add tool result to chat history
                  chatHistory.current.push({
                    role: "tool",
                    content: result,
                    tool_call_id: tc.id,
                    name: tc.function.name,
                  });
                }

                // Continue the conversation — let the LLM respond to tool results
                const continueMsgId = `assistant-${Date.now()}-cont`;
                setMessages(prev => [
                  ...prev,
                  { id: continueMsgId, role: "assistant", content: "", pending: true },
                ]);

                await new Promise<void>((resolveInner) => {
                  chatCompletion(
                    chatHistory.current,
                    MISSION_CONTROL_TOOLS,
                    {
                      onToken: (token) => {
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === continueMsgId
                              ? { ...m, content: m.content + token }
                              : m,
                          ),
                        );
                      },
                      onToolCall: () => {},
                      onDone: (contMsg) => {
                        chatHistory.current.push(contMsg);
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === continueMsgId ? { ...m, pending: false } : m,
                          ),
                        );
                        resolveInner();
                      },
                      onError: (err) => {
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === continueMsgId
                              ? { ...m, content: `Error: ${err}`, pending: false }
                              : m,
                          ),
                        );
                        resolveInner();
                      },
                    },
                    config,
                  );
                });
              } else {
                // No tool calls — just update the message
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMsgId ? { ...m, pending: false } : m,
                  ),
                );
              }

              resolve();
            },
            onError: (err) => {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: `Error: ${err}`, pending: false }
                    : m,
                ),
              );
              resolve();
            },
          },
          config,
        );
      });
    };

    await processResponse();
    setIsStreaming(false);
  }, [input, isStreaming, config, account, buildContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    setConnectionStatus("unknown");
    const result = await testConnection(config);
    setConnectionStatus(result.ok ? "ok" : "error");
    if (result.models) setAvailableModels(result.models);
    if (result.modelDetails) setModelDetails(result.modelDetails);
  };

  const handleSaveConfig = () => {
    saveLLMConfig(config);
    setShowSettings(false);
  };

  return (
    <Flex direction="column" style={{ height: "100%", background: "var(--color-background)" }}>
      {/* Header */}
      <Flex
        align="center"
        justify="between"
        px="3"
        py="2"
        style={{ borderBottom: "1px solid var(--gray-a5)" }}
      >
        <Flex align="center" gap="2">
          <Text size="3" weight="bold" style={{ fontFamily: "monospace" }}>
            MISSION CONTROL
          </Text>
          <Badge
            size="1"
            color={connectionStatus === "ok" ? "green" : connectionStatus === "error" ? "red" : "gray"}
          >
            {connectionStatus === "ok" ? "ONLINE" : connectionStatus === "error" ? "OFFLINE" : "STANDBY"}
          </Badge>
        </Flex>
        <Flex gap="1">
        <IconButton
          size="1"
          variant="ghost"
          onClick={() => {
            setMessages([{ id: "welcome", role: "system", content: "Mission Control online. How can I help, Commander?" }]);
            chatHistory.current = [];
            localStorage.removeItem(CHAT_HISTORY_KEY);
            localStorage.removeItem(CHAT_MESSAGES_KEY);
          }}
          title="Clear Chat"
        >
          <svg width="14" height="14" viewBox="0 0 15 15" fill="currentColor">
            <path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H5H10H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H11V12C11 12.5523 10.5523 13 10 13H5C4.44772 13 4 12.5523 4 12V4H3.5C3.22386 4 3 3.77614 3 3.5ZM5 4H10V12H5V4Z" />
          </svg>
        </IconButton>
        <IconButton
          size="1"
          variant="ghost"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 15 15" fill="currentColor">
            <path d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02413 3.23978 2.07312 2.95903 2.35386L2.35294 2.95996C2.0722 3.2407 2.0232 3.6784 2.23493 4.01427L2.80942 4.92561C2.62307 5.2645 2.47227 5.62594 2.36216 6.00481L1.31209 6.24287C0.924883 6.33065 0.650024 6.6748 0.650024 7.07183V7.92897C0.650024 8.32601 0.924883 8.67015 1.31209 8.75794L2.36228 8.99603C2.47246 9.375 2.62335 9.73652 2.80979 10.0755L2.2356 10.9867C2.02388 11.3225 2.07289 11.7602 2.35363 12.0409L2.95972 12.647C3.24047 12.9278 3.67815 12.9768 4.01402 12.7651L4.92504 12.1907C5.26391 12.377 5.62528 12.5278 6.00404 12.638L6.24198 13.6881C6.32977 14.0753 6.67391 14.3502 7.07095 14.3502H7.92809C8.32512 14.3502 8.66927 14.0753 8.75705 13.6881L8.995 12.6381C9.37393 12.5279 9.73545 12.3771 10.0745 12.1907L10.9855 12.765C11.3214 12.9767 11.7591 12.9277 12.0398 12.647L12.6459 12.0409C12.9267 11.7602 12.9757 11.3225 12.7639 10.9866L12.1897 10.0755C12.3762 9.73654 12.5271 9.37502 12.6373 8.99609L13.6874 8.75794C14.0746 8.67015 14.3495 8.32601 14.3495 7.92897V7.07183C14.3495 6.6748 14.0746 6.33065 13.6874 6.24287L12.6374 6.00481C12.5273 5.62593 12.3764 5.26444 12.1899 4.92551L12.764 4.01427C12.9757 3.6784 12.9267 3.2407 12.646 2.95996L12.0399 2.35386C11.7592 2.07312 11.3215 2.02413 10.9856 2.23585L10.0746 2.81014C9.73568 2.62371 9.37418 2.47283 8.99525 2.3627L8.75705 1.31231C8.66927 0.925096 8.32512 0.650238 7.92809 0.650238H7.07095ZM7.49952 5.25023C6.2569 5.25023 5.24976 6.25737 5.24976 7.50001C5.24976 8.74264 6.2569 9.74978 7.49952 9.74978C8.74216 9.74978 9.7493 8.74264 9.7493 7.50001C9.7493 6.25737 8.74216 5.25023 7.49952 5.25023Z" />
          </svg>
        </IconButton>
        </Flex>
      </Flex>

      {/* Messages */}
      <ScrollArea
        ref={scrollRef}
        style={{ flex: 1, padding: "12px" }}
      >
        <Flex direction="column" gap="2">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </Flex>
      </ScrollArea>

      {/* Input */}
      <Flex
        gap="2"
        p="3"
        style={{ borderTop: "1px solid var(--gray-a5)" }}
      >
        <TextField.Root
          ref={inputRef}
          placeholder={isStreaming ? "Waiting for response..." : "Talk to Mission Control..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          style={{ flex: 1 }}
          size="2"
        />
        <Button
          size="2"
          onClick={sendMessage}
          disabled={isStreaming || !input.trim()}
        >
          Send
        </Button>
      </Flex>

      {/* Settings Dialog */}
      <Dialog.Root open={showSettings} onOpenChange={setShowSettings}>
        <Dialog.Content maxWidth="450px">
          <Dialog.Title>Mission Control Settings</Dialog.Title>
          <Dialog.Description size="2" color="gray">
            Configure your LLM endpoint. Supports LM Studio, Ollama, OpenAI, or any OpenAI-compatible API.
          </Dialog.Description>

          <Flex direction="column" gap="3" mt="4">
            <label>
              <Text size="2" weight="bold" mb="1">API Endpoint</Text>
              <TextField.Root
                value={config.endpoint}
                onChange={(e) => setConfig(c => ({ ...c, endpoint: e.target.value }))}
                placeholder="http://localhost:11434/v1"
              />
            </label>

            <label>
              <Text size="2" weight="bold" mb="1">Model</Text>
              {availableModels.length > 0 ? (
                <Select.Root
                  value={config.model}
                  onValueChange={(v) => setConfig(c => ({ ...c, model: v }))}
                >
                  <Select.Trigger style={{ width: "100%" }} />
                  <Select.Content>
                    {availableModels.map(m => {
                      const info = modelDetails.find(d => d.id === m);
                      const label = info
                        ? `${info.displayName ?? m} (${info.params ?? "?"}${info.toolUse ? " · tools" : ""})`
                        : m;
                      return <Select.Item key={m} value={m}>{label}</Select.Item>;
                    })}
                  </Select.Content>
                </Select.Root>
              ) : (
                <TextField.Root
                  value={config.model}
                  onChange={(e) => setConfig(c => ({ ...c, model: e.target.value }))}
                  placeholder="qwen/qwen3.5-9b"
                />
              )}
            </label>

            {/* Show loaded model info */}
            {(() => {
              const active = modelDetails.find(d => d.id === config.model);
              if (!active) return null;
              return (
                <Card size="1" style={{ background: "var(--gray-a2)" }}>
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="bold">{active.displayName ?? active.id}</Text>
                    <Flex gap="2" wrap="wrap">
                      {active.params && <Badge size="1" variant="soft">{active.params}</Badge>}
                      {active.toolUse && <Badge size="1" color="green" variant="soft">Tool Use</Badge>}
                      <Badge size="1" variant="soft" color={active.loaded ? "green" : "gray"}>
                        {active.loaded ? "Loaded" : "Not Loaded"}
                      </Badge>
                    </Flex>
                    {active.loadedContextLength && (
                      <Text size="1" color="gray">
                        Context: {active.loadedContextLength.toLocaleString()} tokens
                        {active.contextLength ? ` (${(active.contextLength / 1000).toFixed(0)}K theoretical max)` : ""}
                      </Text>
                    )}
                    {!active.loadedContextLength && active.contextLength && (
                      <Text size="1" color="gray">
                        Theoretical max: {(active.contextLength / 1000).toFixed(0)}K tokens
                      </Text>
                    )}
                  </Flex>
                </Card>
              );
            })()}

            <label>
              <Text size="2" weight="bold" mb="1">API Key (optional for local)</Text>
              <TextField.Root
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder="Leave empty for local LLMs"
              />
            </label>

            <label>
              <Text size="2" weight="bold" mb="1">Max Tokens</Text>
              <TextField.Root
                type="number"
                value={String(config.maxTokens)}
                onChange={(e) => setConfig(c => ({ ...c, maxTokens: parseInt(e.target.value) || 2048 }))}
              />
            </label>

            <Separator size="4" />

            <Flex gap="2" align="center">
              <Button variant="soft" onClick={handleTestConnection}>
                Test Connection
              </Button>
              <Badge
                color={connectionStatus === "ok" ? "green" : connectionStatus === "error" ? "red" : "gray"}
              >
                {connectionStatus === "ok"
                  ? `Connected — ${availableModels.length} models`
                  : connectionStatus === "error"
                    ? "Failed"
                    : "Not tested"}
              </Badge>
            </Flex>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button onClick={handleSaveConfig}>Save</Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

/**
 * Parse content into segments: text, thinking blocks, etc.
 * Handles <think>...</think> tags from reasoning models (Qwen, DeepSeek, etc.)
 */
interface ContentSegment {
  type: "text" | "thinking";
  content: string;
}

function parseContent(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const thinkRegex = /<think>([\s\S]*?)(<\/think>|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = thinkRegex.exec(raw)) !== null) {
    // Text before this think block
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", content: text });
    }
    // The thinking content
    const thinkContent = match[1].trim();
    if (thinkContent) segments.push({ type: "thinking", content: thinkContent });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last think block
  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex).trim();
    if (text) segments.push({ type: "text", content: text });
  }

  // If no segments found, treat whole thing as text
  if (segments.length === 0 && raw.trim()) {
    segments.push({ type: "text", content: raw.trim() });
  }

  return segments;
}

/** Collapsible thinking block */
function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Card
      size="1"
      style={{
        background: "var(--gray-a2)",
        borderLeft: "3px solid var(--purple-9)",
        cursor: "pointer",
        maxWidth: "95%",
      }}
      onClick={() => setOpen(o => !o)}
    >
      <Flex align="center" gap="2">
        <Text size="1" style={{ opacity: 0.6, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          ▶
        </Text>
        <Text size="1" color="purple" weight="bold">
          Reasoning{isStreaming ? "..." : ""}
        </Text>
        {!open && (
          <Text size="1" color="gray" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {content.slice(0, 80)}{content.length > 80 ? "..." : ""}
          </Text>
        )}
      </Flex>
      {open && (
        <Text
          size="1"
          color="gray"
          mt="2"
          style={{ whiteSpace: "pre-wrap", lineHeight: 1.4, fontStyle: "italic" }}
        >
          {content}
        </Text>
      )}
    </Card>
  );
}

/** Collapsible tool result */
function ToolResultBlock({ message }: { message: DisplayMessage }) {
  const [open, setOpen] = useState(false);
  const toolName = message.content.split("\n")[0] ?? "Tool result";
  const lineCount = message.content.split("\n").length;

  return (
    <Card
      size="1"
      style={{
        background: "var(--gray-a2)",
        borderLeft: "3px solid var(--accent-9)",
        cursor: "pointer",
        maxWidth: "95%",
      }}
      onClick={() => setOpen(o => !o)}
    >
      <Flex align="center" gap="2">
        <Text size="1" style={{ opacity: 0.6, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          ▶
        </Text>
        <Badge size="1" color="blue" variant="soft">Tool Result</Badge>
        {!open && (
          <Text size="1" color="gray" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {toolName.slice(0, 60)} ({lineCount} lines)
          </Text>
        )}
      </Flex>
      {open && (
        <Text
          size="1"
          color="gray"
          mt="2"
          style={{ whiteSpace: "pre-wrap", lineHeight: 1.4, fontFamily: "monospace", fontSize: "11px" }}
        >
          {message.content}
        </Text>
      )}
      {message.pendingAction && !message.actionExecuted && (
        <Flex gap="2" mt="2">
          <Badge color="orange" size="1">Action pending — confirm in chat</Badge>
        </Flex>
      )}
    </Card>
  );
}

/** Individual message bubble */
function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isToolResult = message.role === "tool-result";

  if (isToolResult) {
    return <ToolResultBlock message={message} />;
  }

  if (isSystem) {
    return (
      <Flex justify="center" py="2">
        <Badge variant="soft" color="green" size="1">{message.content}</Badge>
      </Flex>
    );
  }

  if (isUser) {
    return (
      <Flex justify="end">
        <Card
          size="1"
          style={{
            maxWidth: "85%",
            background: "var(--accent-3)",
            borderRadius: "12px 12px 4px 12px",
          }}
        >
          <Text size="2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {message.content}
          </Text>
        </Card>
      </Flex>
    );
  }

  // Assistant message — parse into segments
  const segments = parseContent(message.content);

  // If empty and pending, show typing indicator
  if (segments.length === 0 && message.pending) {
    return (
      <Flex justify="start">
        <Card size="1" style={{ background: "var(--gray-a3)", borderRadius: "12px 12px 12px 4px" }}>
          <Text size="2" style={{ opacity: 0.5, animation: "blink 1s infinite" }}>Thinking...</Text>
        </Card>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="1" style={{ maxWidth: "90%" }}>
      {segments.map((seg, i) => {
        if (seg.type === "thinking") {
          const isLastAndPending = message.pending && i === segments.length - 1;
          return <ThinkingBlock key={i} content={seg.content} isStreaming={isLastAndPending} />;
        }
        return (
          <Flex key={i} justify="start">
            <Card
              size="1"
              style={{
                background: "var(--gray-a3)",
                borderRadius: "12px 12px 12px 4px",
              }}
            >
              <Text size="2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {seg.content}
                {message.pending && i === segments.length - 1 && (
                  <span style={{ opacity: 0.5, animation: "blink 1s infinite" }}> ...</span>
                )}
              </Text>
            </Card>
          </Flex>
        );
      })}
    </Flex>
  );
}
