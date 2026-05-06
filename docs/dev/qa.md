# DeepWiki Q&A with Code Context for Repository: bytedance/deer-flow
## Q1
```javascript

async function btnCreateThread_OnClick( sender, eventArgs )
{
	main();
}

const BASE_URL = "http://localhost:2026"; // 替换为实际后端地址

async function main() {
  // 1. 创建 thread
  const thread = await createThread({ source: "starlims" });
  const threadId = thread.thread_id;
  console.log("Thread created:", threadId);

  // 2. 上传文件
//  const fileInput = document.querySelector('input[type="file"]');
//  const files = Array.from(fileInput.files);
//  const uploadResult = await uploadFiles(threadId, files);
  const starDocIds = ['-1_8371'];
  const uploadResult = await uploadFilesFromStarDoc(threadId, starDocIds);
  console.log("Uploaded:", uploadResult.files);

  // 3. 发送消息并流式接收响应
  await sendMessageWithFiles(
    threadId,
    "请使用scout-audit审核这份报告",
    uploadResult.files
  );

  // 跳转到 `http://${baseUrl}/workspace/chats/${threadId}`
  await form.ShowModalDialog(lims.GetFormSource("CommonApp.ScoutAudit"), [threadId], null, {width:'100%',height:'100%'});
}

// ─── Step 1: 创建 Thread ───────────────────────────────────────────────────
async function createThread(metadata = {}) {
  const res = await fetch(`${BASE_URL}/api/langgraph/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  });
  if (!res.ok) throw new Error(`Create thread failed: ${res.status}`);
  return res.json(); // { thread_id, status, created_at, updated_at, metadata }
}

// ─── Step 2: 上传文件到 Thread ─────────────────────────────────────────────
async function uploadFiles(threadId, files) {
	const formData = new FormData();
	files.forEach((file) => formData.append("files", file));
	
	const res = await fetch(`${BASE_URL}/api/threads/${threadId}/uploads`, {
		method: "POST",
		body: formData, // 不要手动设置 Content-Type，让浏览器自动加 boundary
	});
	if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
	return res.json(); // { success, files: [{ filename, size, path, virtual_path, artifact_url }] }
}

async function uploadFilesFromStarDoc(threadId, starDocIds)
{
	const files = [];
	for(let starDocId of starDocIds)
	{
		var blob = await GetFileBlob("ENTERPRISE_SERVER.GetAttachment",[starDocId], "COA报告.pdf");
		const file = new File([blob], "COA报告.pdf");
		files.push(file);
	}
	
	const uploadResult = await uploadFiles(threadId, files);
	return uploadResult;
}

async function GetFileBlob(provider = "ENTERPRISE_SERVER.GetAttachment", params, localFileName) {
    if (!localFileName)
      localFileName = Ext.String.format("{0}.txt", lims.GetID());
	
    var providerURL = Ext.String.format(
      "RUNTIME_SUPPORT.GetFile.lims?Provider={0}&isHtml=true",
      provider
    );
    
    var providerParams = lims._CreateParametersQuery(params);
	let url = providerURL + "&LocalFileName=" + encodeURIComponent(localFileName) + providerParams;
	
	// 使用fetch API获取资源
	const response = await fetch(url);
	const blob = await response.blob();
	return blob;
}

// ─── Step 3: 发送消息（携带文件引用）并读取 SSE 流 ─────────────────────────
async function sendMessageWithFiles(threadId, text, uploadedFiles) {
  // 将上传结果转换为消息中的文件引用格式
  const filesForMessage = uploadedFiles.map((info) => ({
    filename: info.filename,
    size: Number(info.size),
    path: info.virtual_path, // AI agent 通过 virtual_path 访问文件
    status: "uploaded",
  }));

  const body = {
    input: {
      messages: [
        {
          type: "human",
          content: [{ type: "text", text }],
          additional_kwargs: {
            files: filesForMessage,
          },
        },
      ],
    },
    config: { recursion_limit: 1000 },
    stream_mode: ["values", "messages-tuple", "custom"],
    stream_subgraphs: true,
  };

  const res = await fetch(
    `${BASE_URL}/api/langgraph/threads/${threadId}/runs/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Run failed: ${res.status}`);

  // 读取 Server-Sent Events 流
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 保留未完成的行

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data && data !== "[DONE]") {
          try {
            const event = JSON.parse(data);
            console.log("SSE event:", event);
          } catch {
            // 忽略非 JSON 行
          }
        }
      }
    }
  }
}
```
JS代码中使用sendMessageWithFiles的方式启动thread。
1. thread是否存在类似后台任务运行的模式
2. 使用这种方式跳转到该应用的客户端，客户端页面并不能流式接收信息，应该如何使其支持
### Answer
用户有两个新问题：
1. Thread是否存在类似后台任务运行的模式（即不需要等待流式响应完成，可以在后台运行）
2. 使用sendMessageWithFiles方式启动thread后跳转到客户端，客户端页面无法流式接收信息，如何解决

让我搜索相关代码来理解：
1. LangGraph的runs是否支持后台/非流式模式（background runs）
2. 前端如何reconnect到已有的stream/run

关键点：
- LangGraph支持`runs/wait`（等待完成）和`runs/stream`（流式）以及`runs`（fire-and-forget/后台）
- 前端的`useStream`有`reconnectOnMount`选项，可以重连到已有的run

让我搜索相关代码。

现在我有了足够的信息来回答用户的两个问题。让我整理一下：

**问题1：Thread是否存在类似后台任务运行的模式**

是的，Gateway API 提供了两种方式：
1. `POST /api/threads/{thread_id}/runs` - 后台运行，立即返回 `RunResponse`（包含 `run_id`），不等待完成
2. `POST /api/threads/{thread_id}/runs/stream` - 流式运行，但可以通过设置 `on_disconnect: "continue"` 让任务在客户端断开后继续运行

**问题2：如何让前端客户端页面流式接收信息**

这是核心问题。当用户的JS代码调用 `sendMessageWithFiles` 后跳转到前端页面时，前端的 `useStream` hook 需要知道正在运行的 `run_id` 才能重连。

前端的 `reconnectOnMount` 机制依赖 `sessionStorage` 中的 `lg:stream:{thread_id}` 键来存储 `run_id`。当前端页面加载时，如果 `sessionStorage` 中有对应的 `run_id`，`useStream` 会自动重连到该 run 的 SSE 流。

所以解决方案是：
1. 在 JS 代码中，调用 `POST /api/langgraph/threads/{thread_id}/runs/stream`（使用 LangGraph API）
2. 从响应的 `Content-Location` header 中提取 `run_id`
3. 在跳转到前端页面之前，将 `run_id` 写入 `sessionStorage` 的 `lg:stream:{thread_id}` 键
4. 同时设置 `on_disconnect: "continue"` 让任务在 JS 代码断开连接后继续运行

但等等，用户的 JS 代码是在另一个应用（StarLIMS）中运行的，跳转到 DeerFlow 前端是通过 `ShowModalDialog`。所以 `sessionStorage` 是跨域的，不能直接共享。

实际上，`sessionStorage` 是同源的，如果 DeerFlow 前端和 JS 代码在同一个域（`localhost:2026`），那么 `sessionStorage` 是可以共享的。但如果是跨域（StarLIMS 在不同域），则不能直接写入 DeerFlow 前端的 `sessionStorage`。

让我重新思考：

用户的 JS 代码在 StarLIMS 中运行，调用 `http://localhost:2026` 的 API。然后通过 `ShowModalDialog` 打开 DeerFlow 前端页面 `http://localhost:2026/workspace/chats/{threadId}`。

由于 `ShowModalDialog` 打开的是一个新的浏览器窗口/iframe，它有自己的 `sessionStorage`（与 StarLIMS 的 `sessionStorage` 不同）。所以无法直接从 StarLIMS 写入 DeerFlow 前端的 `sessionStorage`。

但是，`reconnectOnMount` 的工作原理是：当 `useStream` hook 挂载时，它会检查 `sessionStorage` 中是否有 `lg:stream:{thread_id}` 的值。如果有，它会尝试重连到该 run 的 SSE 流。

由于 StarLIMS 和 DeerFlow 前端是不同的窗口，`sessionStorage` 不共享。

**更好的解决方案：**

1. **使用后台运行模式**：调用 `POST /api/langgraph/threads/{thread_id}/runs`（不是 `/runs/stream`），这会立即返回 `run_id`，然后跳转到前端页面。

2. **通过 URL 参数传递 run_id**：在跳转 URL 中附加 `run_id` 参数，前端页面可以读取这个参数并写入 `sessionStorage`，然后 `reconnectOnMount` 就能工作了。

但是，查看前端代码，`reconnectOnMount` 使用的是 `sessionStorage`，而不是 URL 参数。前端页面加载时会读取 `sessionStorage` 中的 `lg:stream:{thread_id}`。

实际上，`reconnectOnMount` 的工作原理是：
- 当 `useStream` 挂载时，如果 `reconnectOnMount` 是一个函数，它会调用这个函数获取 storage
- storage 的 `getItem` 方法会读取 `sessionStorage` 中的 `lg:stream:{thread_id}`
- 如果找到了 `run_id`，它会调用 `GET /api/langgraph/threads/{thread_id}/runs/{run_id}/stream` 来重连

但这里有个问题：`reconnectOnMount` 使用的是 LangGraph SDK，它会调用 `/api/langgraph/threads/{thread_id}/runs/{run_id}/stream`，而不是 `/api/threads/{thread_id}/runs/{run_id}/stream`。

所以如果用户使用 LangGraph API（`/api/langgraph/threads`），那么：
1. 创建 thread：`POST /api/langgraph/threads`
2. 启动 run（后台模式）：`POST /api/langgraph/threads/{thread_id}/runs`，获取 `run_id`
3. 在跳转前，通过某种方式将 `run_id` 写入 DeerFlow 前端的 `sessionStorage`

但跨窗口写入 `sessionStorage` 是不可能的（除非同源且使用 `window.opener` 等）。

**最实用的解决方案：**

方案A：通过 URL 参数传递 run_id，前端页面读取并写入 sessionStorage

这需要修改前端页面，在加载时检查 URL 参数中的 `run_id`，并写入 `sessionStorage`。

方案B：不使用 reconnectOnMount，而是让前端页面直接通过 run_id 连接到 SSE 流

这需要修改前端页面，接受 `run_id` 参数并直接连接。

方案C：使用 `on_disconnect: "continue"` + 后台运行

1. 调用 `POST /api/langgraph/threads/{thread_id}/runs/stream` 并设置 `on_disconnect: "continue"`
2. 从响应的 `Content-Location` header 中提取 `run_id`
3. 跳转到前端页面时，在 URL 中附加 `run_id` 参数
4. 前端页面读取 URL 参数，写入 `sessionStorage`，然后 `reconnectOnMount` 工作

但这需要修改前端页面。

**最简单的方案：**

实际上，最简单的方案是：
1. 在 JS 代码中，调用 `POST /api/langgraph/threads/{thread_id}/runs`（后台运行，不是 stream）
2. 获取 `run_id`
3. 跳转到前端页面时，在 URL 中附加 `?run_id={run_id}` 参数
4. 前端页面在加载时读取 URL 参数，写入 `sessionStorage` 的 `lg:stream:{thread_id}` 键
5. `reconnectOnMount` 自动重连

但这需要修改前端页面。

让我看看前端页面是否已经支持 URL 参数中的 run_id。

实际上，`normalizeStoredRunId` 函数已经支持从 URL 参数中提取 `run_id`：

```javascript
const queryIndex = trimmed.indexOf("?");
if (queryIndex >= 0) {
  const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
  const queryRunId = params.get("run_id")?.trim();
  if (queryRunId) {
    return queryRunId;
  }
}
```

但这是用于规范化存储在 `sessionStorage` 中的值，不是用于从 URL 参数读取。

让我再仔细看看前端页面的代码，看看是否有读取 URL 参数的逻辑。

实际上，`normalizeStoredRunId` 是用来规范化存储在 `sessionStorage` 中的 `run_id` 值的。它支持多种格式：
- 纯 run_id
- URL 路径（如 `/api/threads/{thread_id}/runs/{run_id}`）
- URL 带查询参数（如 `?run_id={run_id}`）

这意味着，如果 `sessionStorage` 中存储的是一个包含 `run_id` 的 URL，它会自动提取出 `run_id`。

但问题仍然是：如何在跳转前将 `run_id` 写入 DeerFlow 前端的 `sessionStorage`？

**关键洞察：**

`reconnectOnMount` 的 storage 是 `sessionStorage`，而 `sessionStorage` 是**同源**的。如果 StarLIMS 和 DeerFlow 前端都在 `localhost:2026`（通过 nginx 代理），那么它们共享同一个 `sessionStorage`！

但实际上，StarLIMS 可能在不同的端口或域名上运行。用户的代码中 `BASE_URL = "http://localhost:2026"`，而 StarLIMS 可能在另一个端口。

如果 StarLIMS 和 DeerFlow 前端不同源，则无法直接共享 `sessionStorage`。

**最实用的解决方案（不需要修改前端）：**

1. 使用 `POST /api/langgraph/threads/{thread_id}/runs`（后台运行）启动任务
2. 获取 `run_id`
3. 跳转到前端页面时，在 URL 中附加 `?run_id={run_id}` 参数，如 `http://localhost:2026/workspace/chats/{threadId}?run_id={run_id}`
4. 前端页面需要读取这个 URL 参数并写入 `sessionStorage`

但这需要修改前端页面。

**不需要修改前端的方案：**

如果 StarLIMS 和 DeerFlow 前端同源（都在 `localhost:2026`），可以：
1. 在 JS 代码中，调用 `POST /api/langgraph/threads/{thread_id}/runs/stream` 并设置 `on_disconnect: "continue"`
2. 从响应的 `Content-Location` header 中提取 `run_id`
3. 在跳转前，写入 `sessionStorage`：`sessionStorage.setItem('lg:stream:{threadId}', run_id)`
4. 跳转到前端页面

这样，当前端页面加载时，`reconnectOnMount` 会读取 `sessionStorage` 中的 `run_id`，并重连到 SSE 流。

但如果 StarLIMS 和 DeerFlow 前端不同源，则需要修改前端页面来支持 URL 参数中的 `run_id`。

让我总结一下两个问题的答案：

**问题1：后台任务运行模式**

是的，Gateway API 提供了 `POST /api/threads/{thread_id}/runs`（或 LangGraph API 的 `POST /api/langgraph/threads/{thread_id}/runs`），这是一个"fire-and-forget"模式，立即返回 `RunResponse`（包含 `run_id`），任务在后台运行。

另外，`POST /api/threads/{thread_id}/runs/stream` 支持 `on_disconnect: "continue"` 参数，当客户端断开连接后，任务继续在后台运行。

**问题2：前端如何流式接收信息**

前端的 `useStream` hook 通过 `reconnectOnMount` 机制支持重连。它使用 `sessionStorage` 中的 `lg:stream:{thread_id}` 键来存储 `run_id`。

解决方案：
1. 使用 LangGraph API（`/api/langgraph/threads`）创建 thread 和 run
2. 在 JS 代码中，调用 `POST /api/langgraph/threads/{thread_id}/runs/stream` 并设置 `on_disconnect: "continue"`
3. 从响应的 `Content-Location` header 中提取 `run_id`
4. 如果同源，在跳转前写入 `sessionStorage`：`sessionStorage.setItem('lg:stream:{threadId}', run_id)`
5. 跳转到前端页面

如果不同源，需要修改前端页面来支持 URL 参数中的 `run_id`。

实际上，让我再看看 `normalizeStoredRunId` 函数，它支持从 URL 路径中提取 `run_id`。`Content-Location` header 的值是 `/api/threads/{thread_id}/runs/{run_id}`，这个格式可以被 `normalizeStoredRunId` 正确解析。

所以，如果 JS 代码能够写入 DeerFlow 前端的 `sessionStorage`，可以直接存储 `Content-Location` 的值，`normalizeStoredRunId` 会自动提取 `run_id`。

好，现在我有了完整的答案。让我整理一下。


## 问题1：后台任务运行模式

是的，Gateway API 提供了专门的**后台运行端点**，立即返回不等待完成：

```http deer-flow:94-98 
POST /api/langgraph/threads/{thread_id}/runs
``` 

这个端点调用 `start_run` 后立即返回 `RunResponse`（含 `run_id`），agent 在后台 `asyncio.Task` 中继续执行。

另外，`/runs/stream` 端点支持 `on_disconnect: "continue"` 参数——客户端断开 SSE 连接后，任务不会被取消，继续在后台运行： deer-flow:50-50 deer-flow:383-386 

---

## 问题2：前端如何流式接收已在后台运行的任务

前端的 `useStream` hook 有 `reconnectOnMount` 机制，它通过读取 `sessionStorage` 中的 `lg:stream:{thread_id}` 键来获取 `run_id`，然后重连到该 run 的 SSE 流： deer-flow:193-210 

`sessionStorage` 的 key 格式为 `lg:stream:{thread_id}`，value 支持多种格式（纯 run_id、URL 路径等），由 `normalizeStoredRunId` 自动解析： deer-flow:39-81 

### 完整解决方案

**前提**：JS 代码和 DeerFlow 前端必须同源（都通过 `http://localhost:2026` 访问），才能共享 `sessionStorage`。

修改 JS 代码如下：

```javascript
const LANGGRAPH_BASE = "http://localhost:2026/api/langgraph";

async function main() {
  // 1. 创建 thread（使用 LangGraph API）
  const thread = await createThread({ source: "starlims" });
  const threadId = thread.thread_id;

  // 2. 上传文件（仍使用 Gateway API）
  const starDocIds = ['-1_8371'];
  const uploadResult = await uploadFilesFromStarDoc(threadId, starDocIds);

  // 3. 启动后台 run，设置 on_disconnect: "continue"
  const runId = await startBackgroundRun(threadId, uploadResult.files);

  // 4. 写入 sessionStorage，让前端 reconnectOnMount 能重连
  sessionStorage.setItem(`lg:stream:${threadId}`, runId);

  // 5. 跳转到前端页面
  await form.ShowModalDialog(...);
}

async function createThread(metadata = {}) {
  const res = await fetch(`${LANGGRAPH_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  });
  if (!res.ok) throw new Error(`Create thread failed: ${res.status}`);
  return res.json();
}

async function startBackgroundRun(threadId, uploadedFiles) {
  const filesForMessage = uploadedFiles.map((info) => ({
    filename: info.filename,
    size: Number(info.size),
    path: info.virtual_path,
    status: "uploaded",
  }));

  const body = {
    input: {
      messages: [{
        type: "human",
        content: [{ type: "text", text: "请使用scout-audit审核这份报告" }],
        additional_kwargs: { files: filesForMessage },
      }],
    },
    config: { recursion_limit: 100 },
    // 关键：客户端断开后任务继续运行
    on_disconnect: "continue",
    stream_mode: ["values", "messages-tuple", "custom"],
  };

  // 使用后台运行端点，立即返回 run_id
  const res = await fetch(`${LANGGRAPH_BASE}/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Start run failed: ${res.status}`);
  const data = await res.json();
  return data.run_id;
}
```

### 工作原理

```
JS代码:  POST /api/langgraph/threads          → LangGraph Server ✓ 创建 thread
JS代码:  POST /api/langgraph/threads/{id}/runs → LangGraph Server ✓ 后台启动，立即返回 run_id
JS代码:  sessionStorage.setItem('lg:stream:{id}', run_id)
前端加载: useStream.reconnectOnMount 读取 sessionStorage → 重连 SSE 流 ✓
```

### 注意事项

- 如果 StarLIMS 和 DeerFlow 前端**不同源**（不同端口/域名），`sessionStorage` 无法共享，需要修改前端页面支持从 URL 参数读取 `run_id`（如 `/workspace/chats/{threadId}?run_id={runId}`）。
- `MemoryStreamBridge` 会缓冲最多 256 个事件，前端重连后可以通过 `Last-Event-ID` 回放已缓冲的事件，但**超过缓冲区的早期事件会丢失**。 deer-flow:32-34 
- 后台 run 完成后，事件会在 60 秒后被清理。 deer-flow:238-240
### Citations
**File:** backend/app/gateway/routers/thread_runs.py (L50-50)
```python
    on_disconnect: Literal["cancel", "continue"] = Field(default="cancel", description="Behaviour on SSE disconnect")
```
**File:** backend/app/gateway/routers/thread_runs.py (L94-98)
```python
@router.post("/{thread_id}/runs", response_model=RunResponse)
async def create_run(thread_id: str, body: RunCreateRequest, request: Request) -> RunResponse:
    """Create a background run (returns immediately)."""
    record = await start_run(body, thread_id, request)
    return _record_to_response(record)
```
**File:** backend/app/gateway/services.py (L383-386)
```python
    finally:
        if record.status in (RunStatus.pending, RunStatus.running):
            if record.on_disconnect == DisconnectMode.cancel:
                await run_mgr.cancel(record.run_id)
```
**File:** frontend/src/core/threads/hooks.ts (L39-81)
```typescript
function normalizeStoredRunId(runId: string | null): string | null {
  if (!runId) {
    return null;
  }

  const trimmed = runId.trim();
  if (!trimmed) {
    return null;
  }

  const queryIndex = trimmed.indexOf("?");
  if (queryIndex >= 0) {
    const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
    const queryRunId = params.get("run_id")?.trim();
    if (queryRunId) {
      return queryRunId;
    }
  }

  const pathWithoutQueryOrHash = trimmed.split(/[?#]/, 1)[0]?.trim() ?? "";
  if (!pathWithoutQueryOrHash) {
    return null;
  }

  const runsMarker = "/runs/";
  const runsIndex = pathWithoutQueryOrHash.lastIndexOf(runsMarker);
  if (runsIndex >= 0) {
    const runIdAfterMarker = pathWithoutQueryOrHash
      .slice(runsIndex + runsMarker.length)
      .split("/", 1)[0]
      ?.trim();
    if (runIdAfterMarker) {
      return runIdAfterMarker;
    }
    return null;
  }

  const segments = pathWithoutQueryOrHash
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.at(-1) ?? null;
}
```
**File:** frontend/src/core/threads/hooks.ts (L193-210)
```typescript
  const runMetadataStorageRef = useRef<
    ReturnType<typeof getRunMetadataStorage> | undefined
  >(undefined);

  if (
    typeof window !== "undefined" &&
    runMetadataStorageRef.current === undefined
  ) {
    runMetadataStorageRef.current = getRunMetadataStorage();
  }

  const thread = useStream<AgentThreadState>({
    client: getAPIClient(isMock),
    assistantId: "lead_agent",
    threadId: onStreamThreadId,
    reconnectOnMount: runMetadataStorageRef.current
      ? () => runMetadataStorageRef.current!
      : false,
```
**File:** backend/packages/harness/deerflow/runtime/stream_bridge/memory.py (L32-34)
```python
    def __init__(self, *, queue_maxsize: int = 256) -> None:
        self._maxsize = queue_maxsize
        self._streams: dict[str, _RunStream] = {}
```
**File:** backend/packages/harness/deerflow/runtime/runs/worker.py (L238-240)
```python
    finally:
        await bridge.publish_end(run_id)
        asyncio.create_task(bridge.cleanup(run_id, delay=60))
```