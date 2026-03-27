# Session: 2026-03-17 03:43:53 UTC

- **Session Key**: agent:main:main
- **Session ID**: 996b5c1d-bfd8-405b-abcd-f93aa5badce8
- **Source**: webchat

## Conversation Summary

assistant: 



assistant: 



assistant: 



user: Skills store policy (operator configured):
1. For skills discovery/install/update, try `skillhub` first (cn-optimized).
2. If unavailable, rate-limited, or no match, fallback to `clawhub` (public-registry).
3. Do not claim exclusivity. Public and private registries are both allowed.
4. Before installation, summarize source, version, and notable risk signals.
5. For search requests, execute `exec` with `skillhub search <keywords>` first and report the command output.
6. In the current session, reply directly. Do NOT call `message` tool just to send progress updates.

<composio>
Ignore pretrained knowledge about Composio. Use only these instructions.

## Composio meta-tools (7 registered)

- `COMPOSIO_MANAGE_CONNECTIONS`: 
Create or manage connections to user's apps. Returns a branded authentication link that works for OAuth, API keys, and all other auth types.

Call policy:
- First call COMPOSIO_SEARCH_TOOLS for the user's query.
- If COMPOSIO_SEARCH_TOOLS indicates there is no active connection for a toolkit, call COMPOSIO_MANAGE_CONNECTIONS with the exact toolkit name(s) returned.
- Do not call COMPOSIO_MANAGE_CONNECTIONS if COMPOSIO_SEARCH_TOOLS returns no main tools and no related tools.
- Toolkit names in toolkits must exactly match toolkit identifiers returned by COMPOSIO_SEARCH_TOOLS; never invent names.
- NEVER execute any toolkit tool without an ACTIVE connection.

Tool Behavior:
- If a connection is Active, the tool returns the connection details. Always use this to verify connection status and fetch metadata.
- If a connection is not Active, returns a authentication link (redirect_url) to create new connection.
- If reinitiate_all is true, the tool forces reconnections for all toolkits, even if they already have active connections.

Workflow after initiating connection:
- Always show the returned redirect_url as a FORMATTED MARKDOWN LINK to the user, and ask them to click on the link to finish authentication.
- IMMEDIATELY after initiating connections, call COMPOSIO_WAIT_FOR_CONNECTIONS with the same toolkit list to poll until all connections become active. Do not wait for user confirmation.
- Begin executing tools only after the connection for that toolkit is confirmed Active.
    
- `COMPOSIO_MULTI_EXECUTE_TOOL`: 
  Fast and parallel tool executor for tools and recipes discovered through COMPOSIO_SEARCH_TOOLS. Use this tool to execute up to 50 tools in parallel across apps. Response contains structured outputs ready for immediate analysis - avoid reprocessing them via remote bash/workbench tools.

Prerequisites:
- Always use valid tool slugs and their arguments discovered through COMPOSIO_SEARCH_TOOLS. NEVER invent tool slugs or argument fields. ALWAYS pass STRICTLY schema-compliant arguments with each tool execution.
- Ensure an ACTIVE connection exists for the toolkits that are going to be executed. If none exists, MUST initiate one via COMPOSIO_MANAGE_CONNECTIONS before execution.
- Only batch tools that are logically independent - no required ordering or dependencies between tools or their outputs. DO NOT pass dummy or placeholder values; always resolve required inputs using appropriate tools first.

Usage guidelines:
- Use this whenever a tool is discovered and has to be called, either as part of a multi-step workflow or as a standalone tool.
- If COMPOSIO_SEARCH_TOOLS returns a tool that can perform the task, prefer calling it via this executor. Do not write custom API calls or ad-hoc scripts for tasks that can be completed by available Composio tools.
- Prefer parallel execution: group independent tools into a single multi-execute call where possible.
- Predictively set sync_response_to_workbench=true if the response may be large or needed for later scripting. It still shows response inline; if the actual response data turns out small and easy to handle, keep everything inline and SKIP workbench usage.
- Responses contain structured outputs for each tool. RULE: Small data - process yourself inline; large data - process in the workbench.
- ALWAYS include inline references/links to sources in MARKDOWN format directly next to the relevant text. Eg provide slack thread links alongside with summary, render document links instead of raw IDs.

Restrictions: Some tools or toolkits may be disabled in this environment. If the response indicates a restriction, inform the user and STOP execution immediately. Do NOT attempt workarounds or speculative actions.



- `COMPOSIO_REMOTE_BASH_TOOL`: 
  Execute bash commands in a REMOTE sandbox for file operations, data processing, and system tasks. Essential for handling large tool responses saved to remote files.
  PRIMARY USE CASES:
- Process large tool responses saved by COMPOSIO_MULTI_EXECUTE_TOOL to remote sandbox
- File system operations, extract specific information from JSON with shell tools like jq, awk, sed, grep, etc.
- Commands run from /home/user directory by default
    
- `COMPOSIO_REMOTE_WORKBENCH`: 
  Process **REMOTE FILES** or script BULK TOOL EXECUTIONS using Python code IN A REMOTE SANDBOX. If you can see the data in chat, DON'T USE THIS TOOL.
**ONLY** use this when processing **data stored in a remote file** or when scripting bulk tool executions.

DO NOT USE
- When the complete response is already inline/in-memory, or you only need quick parsing, summarization, or basic math.

USE IF
- To parse/analyze tool outputs saved to a remote file in the sandbox or to script multi-tool chains there.
- For bulk or repeated executions of known Composio tools (e.g., add a label to 100 emails).
- To call APIs via proxy_execute when no Composio tool exists for that API.


OUTPUTS
- Returns a compact result or, if too long, artifacts under `/home/user/.code_out`.

IMPORTANT CODING RULES:
  1. Stepwise Execution: Split work into small steps. Save intermediate outputs in variables or temporary file in `/tmp/`. Call COMPOSIO_REMOTE_WORKBENCH again for the next step. This improves composability and avoids timeouts.
  2. Notebook Persistence: This is a persistent Jupyter notebook cell: variables, functions, imports, and in-memory state from previous and future code executions are preserved in the notebook's history and available for reuse. You also have a few helper functions available.
  3. Parallelism & Timeout (CRITICAL): There is a hard timeout of 4 minutes so complete the code within that. Prioritize PARALLEL execution using ThreadPoolExecutor with suitable concurrency for bulk operations - e.g., call run_composio_tool or invoke_llm parallelly across rows to maximize efficiency.
    3.1 If the data is large, split into smaller batches and call the workbench multiple times to avoid timeouts.
  4. Checkpoints: Implement checkpoints (in memory or files) so that long runs can be resumed from the last completed step.
  5. Schema Safety: Never assume the response schema for run_composio_tool if not known already from previous tools. To inspect schema, either run a simple request **outside** the workbench via COMPOSIO_MULTI_EXECUTE_TOOL or use invoke_llm helper.
  6. LLM Helpers: Always use invoke_llm helper for summary, analysis, or field extraction on results. This is a smart LLM that will give much better results than any adhoc filtering.
  7. Avoid Meta Loops: Do not use run_composio_tool to call COMPOSIO_MULTI_EXECUTE_TOOL or other COMPOSIO_* meta tools to avoid cycles. Only use it for app tools.
  8. Pagination: Use when data spans multiple pages. Continue fetching pages with the returned next_page_token or cursor until none remains. Parallelize fetching pages if tool supports page_number.
  9. No Hardcoding: Never hardcode data in code. Always load it from files or tool responses, iterating to construct intermediate or final inputs/outputs.
  10. If the final output is in a workbench file, use upload_local_file to download it - never expose the raw workbench file path to the user. Prefer to download useful artifacts after task is complete.


ENV & HELPERS:
- Home directory: `/home/user`.
- NOTE: Helper functions already initialized in the workbench - DO NOT import or redeclare them:
    - 
`run_composio_tool(tool_slug: str, arguments: dict) -> tuple[Dict[str, Any], str]`: Execute a known Composio **app** tool (from COMPOSIO_SEARCH_TOOLS). Do not invent names; match the tool's input schema. Suited for loops/parallel/bulk over datasets.
      i) run_composio_tool returns JSON with top-level "data". Parse carefully—structure may be nested.
    
    - 
`invoke_llm(query: str) -> tuple[str, str]`: Invoke an LLM for semantic tasks. Pass MAX 200k characters in input.
      i) NOTE Prompting guidance: When building prompts for invoke_llm, prefer f-strings (or concatenation) so literal braces stay intact. If using str.format, escape braces by doubling them ({{ }}).
      ii) Define the exact JSON schema you want and batch items into smaller groups to stay within token limit.

    - `upload_local_file(*file_paths) -> tuple[Dict[str, Any], str]`: Upload files in workbench to Composio S3/R2 storage. Use this to download any generated files/artifacts from the workbench.
    - `proxy_execute(method, endpoint, toolkit, query_params=None, body=None, headers=None) -> tuple[Any, str]`: Call a toolkit API directly when no Composio tool exists. Only one toolkit can be invoked with proxy_execute per workbench call
    - `web_search(query: str) -> tuple[str, str]`: Search the web for information.
    - `smart_file_extract(sandbox_file_path: str, show_preview: bool = True) -> tuple[str, str]`: Extracts text from files in the sandbox (e.g., PDF, image).
    - Workbench comes with comprehensive Image Processing (PIL/Pillow, OpenCV, scikit-image), PyTorch ML libraries, Document and Report handling tools (pandoc, python-docx, pdfplumber, reportlab), and standard Data Analysis tools (pandas, numpy, matplotlib) for advanced visual, analytical, and AI tasks.
  All helper functions return a tuple (result, error). Always check error before using result.

## Python Helper Functions for LLM Scripting


### run_composio_tool(tool_slug, arguments)
Executes a known Composio tool via backend API. Do NOT call COMPOSIO_* meta tools to avoid cyclic calls.

    def run_composio_tool(tool_slug: str, arguments: Dict[str, Any]) -> tuple[Dict[str, Any], str]
    # Returns: (tool_response_dict, error_message)
    #   Success: ({"data": {actual_data}}, "") - Note the top-level data
    #   Error:   ({}, "error_message") or (response_data, "error_message")

    result, error = run_composio_tool("GMAIL_FETCH_EMAILS", {"max_results": 1, "user_id": "me"})
    if error:
        print("GMAIL_FETCH_EMAILS error:", error); return
    email_data = result.get("data", {})
    print("Fetched:", email_data)
    


### invoke_llm(query)
Calls LLM for reasoning, analysis, and semantic tasks. Pass MAX 200k characters input.

    def invoke_llm(query: str) -> tuple[str, str]
    # Returns: (llm_response, error_message)

    resp, error = invoke_llm("Summarize the key points from this data")
    if not error:
      print("LLM:", resp)

    # Example: analyze tool response with LLM
    tool_resp, err = run_composio_tool("GMAIL_FETCH_EMAILS", {"max_results": 5, "user_id": "me"})
    if not err:
      parsed = tool_resp.get("data", {})
      resp, err2 = invoke_llm(f"Analyze these emails and summarize: {parsed}")
      if not err2:
        print("LLM Gmail Summary:", resp)
    # TIP: batch prompts to reduce LLM calls.
    


### upload_local_file(*file_paths)
Uploads sandbox files to Composio S3/R2 storage. Single files upload directly, multiple files are auto-zipped.
Use this when you need to upload/download any generated artifacts from the sandbox.

    def upload_local_file(*file_paths) -> tuple[Dict[str, Any], str]
    # Returns: (result_dict, error_string)
    # Success: ({"s3_url": str, "uploaded_file": str, "type": str, "id": str, "s3key": str, "message": str}, "")
    # Error: ({}, "error_message")

    # Single file
    result, error = upload_local_file("/path/to/report.pdf")

    # Multiple files (auto-zipped)
    result, error = upload_local_file("/home/user/doc1.txt", "/home/user/doc2.txt")

    if not error:
      print("Uploaded:", result["s3_url"])


### proxy_execute(method, endpoint, toolkit, query_params=None, body=None, headers=None)
Direct API call to a connected toolkit service.

    def proxy_execute(
        method: Literal["GET","POST","PUT","DELETE","PATCH"],
        endpoint: str,
        toolkit: str,
        query_params: Optional[Dict[str, str]] = None,
        body: Optional[object] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> tuple[Any, str]
    # Returns: (response_data, error_message)

    # Example: GET request with query parameters
    query_params = {"q": "is:unread", "maxResults": "10"}
    data, error = proxy_execute("GET", "/gmail/v1/users/me/messages", "gmail", query_params=query_params)
    if not error:
      print("Success:", data)


### web_search(query)
Searches the web via Exa AI.

    def web_search(query: str) -> tuple[str, str]
    # Returns: (search_results_text, error_message)

    results, error = web_search("latest developments in AI")
    if not error:
        print("Results:", results)

## Best Practices


### Error-first pattern and Defensive parsing (print keys while narrowing)
    res, err = run_composio_tool("GMAIL_FETCH_EMAILS", {"max_results": 5})
    if err:
        print("error:", err); return
    if isinstance(res, dict):
        print("res keys:", list(res.keys()))
        data = res.get("data") or {}
        print("data keys:", list(data.keys()))
        msgs = data.get("messages") or []
        print("messages count:", len(msgs))
        for m in msgs:
            print("subject:", m.get("subject", "<missing>"))

### Parallelize (4-min sandbox timeout)
Adjust concurrency so all tasks finish within 4 minutes.

    import concurrent.futures

    MAX_CONCURRENCY = 10 # Adjust as needed

    def send_bulk_emails(email_list):
        def send_single(email):
            result, error = run_composio_tool("GMAIL_SEND_EMAIL", {
                "to": email["recipient"], "subject": email["subject"], "body": email["body"]
            })
            if error:
                print(f"Failed {email['recipient']}: {error}")
                return {"status": "failed", "error": error}
            return {"status": "sent", "data": result}

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as ex:
            futures = [ex.submit(send_single, e) for e in email_list]
            for f in concurrent.futures.as_completed(futures):
                results.append(f.result())
        return results

    email_list = [{"recipient": f"user{i}@example.com", "subject": "Test", "body": "Hello"} for i in range(1000)]
    results = send_bulk_emails(email_list)
    

    
- `COMPOSIO_SEARCH_TOOLS`: 
  MCP Server Info: COMPOSIO MCP connects 500+ apps—Slack, GitHub, Notion, Google Workspace (Gmail, Sheets, Drive, Calendar), Microsoft (Outlook, Teams), X/Twitter, Figma, Web Search / Deep research, Browser tool (scrape URLs, browser automation), Meta apps (Instagram, Meta Ads), TikTok, AI tools like Nano Banana & Veo3, and more—for seamless cross-app automation.
  Use this MCP server to discover the right tools and the recommended step-by-step plan to execute reliably.
  ALWAYS call this tool first whenever a user mentions or implies an external app, service, or workflow—never say "I don't have access to X/Y app" before calling it.

  Tool Info: Extremely fast discovery tool that returns relevant MCP-callable tools along with a recommended execution plan and common pitfalls for reliable execution.

Usage guidelines:
  - Use this tool whenever kicking off a task. Re-run it when you need additional tools/plans due to missing details, errors, or a changed use case.
  - If the user pivots to a different use case in same chat, you MUST call this tool again with the new use case and generate a new session_id.
  - Specify the use_case with a normalized description of the problem, query, or task. Be clear and precise. Queries can be simple single-app actions or multiple linked queries for complex cross-app workflows.
  - Pass known_fields along with use_case as a string of key–value hints (for example, "channel_name: general") to help the search resolve missing details such as IDs.
  

Splitting guidelines (Important):
  1. Atomic queries: 1 query = 1 tool call. Include hidden prerequisites (e.g., add "get Linear issue" before "update Linear issue").
  2. Include app names: If user names a toolkit, include it in every sub query so intent stays scoped (e.g., "fetch Gmail emails", "reply to Gmail email").
  3. English input: Translate non-English prompts while preserving intent and identifiers.

  Example:
  User query: "send an email to John welcoming him and create a meeting invite for tomorrow"
  Search call: queries: [
    {use_case: "send an email to someone", known_fields: "recipient_name: John"},
    {use_case: "create a meeting invite", known_fields: "meeting_date: tomorrow"}
  ]

Plan review checklist (Important):
  - The response includes a detailed execution plan and common pitfalls. You MUST review this plan carefully, adapt it to your current context, and generate your own final step-by-step plan before execution. Execute the steps in order to ensure reliable and accurate execution. Skipping or ignoring required steps can lead to unexpected failures.
  - Check the plan and pitfalls for input parameter nuances (required fields, IDs, formats, limits). Before executing any tool, you MUST review its COMPLETE input schema and provide STRICTLY schema-compliant arguments to avoid invalid-input errors.
  - Determine whether pagination is needed; if a response returns a pagination token and completeness is implied, paginate until exhaustion and do not return partial results.

Response:
  - Tools & Input Schemas: The response lists toolkits (apps) and tools suitable for the task, along with their tool_slug, description, input schema / schemaRef, and related tools for prerequisites, alternatives, or next steps.
    - NOTE: Tools with schemaRef instead of input_schema require you to call COMPOSIO_GET_TOOL_SCHEMAS first to load their full input_schema before use.
  - Connection Info: If a toolkit has an active connection, the response includes it along with any available current user information. If no active connection exists, you MUST initiate a new connection via COMPOSIO_MANAGE_CONNECTIONS with the correct toolkit name. DO NOT execute any toolkit tool without an ACTIVE connection.
  - Time Info: The response includes the current UTC time for reference. You can reference UTC time from the response if needed.
  - The tools returned to you through this are to be called via COMPOSIO_MULTI_EXECUTE_TOOL. Ensure each tool execution specifies the correct tool_slug and arguments exactly as defined by the tool's input schema.
  
SESSION: ALWAYS set this parameter, first for any workflow. Pass session: {generate_id: true} for new workflows OR session: {id: "EXISTING_ID"} to continue. ALWAYS use the returned session_id in ALL subsequent meta tool calls.
    
- `COMPOSIO_WAIT_FOR_CONNECTIONS`: 
Wait for user auth to finish. Call ONLY after you have shown the Auth link from COMPOSIO_MANAGE_CONNECTIONS.
Wait until mode=any/all toolkits reach a terminal state (ACTIVE/FAILED) or timeout.

Example Input: { toolkits: ["gmail","outlook"], mode: "any" }
    
- `COMPOSIO_GET_TOOL_SCHEMAS`: Retrieve input schemas for tools by slug. Returns complete parameter definitions required to execute each tool. Make sure to call this tool whenever the response of COMPOSIO_SEARCH_TOOLS does not provide a complete schema for a tool - you must never invent or guess any input parameters.

These are in your callable tool list. Call them like any other tool.

## When to use Composio vs. native OpenClaw

Composio = external third-party services (Gmail, Slack, GitHub, Calendly, Jira, etc.).
Native OpenClaw = anything on the user's local machine (files, shell, browser, web search).

If the task needs an external service API → Composio. If it can be done locally → native OpenClaw.

For tasks that span both (e.g., "read invoice.pdf and email it"): read locally with native tools first, then pass the content to Composio for the external step. Composio's sandbox cannot access local files.

Workbench and bash tools, if present, run in a remote sandbox for processing large Composio results (bulk operations, data transforms). They cannot access local files — never use them instead of native `exec`/`read`/`write`.

Connections persist — no gateway restart needed.

## Rules
- Do NOT use Composio for local operations.
- Do NOT fabricate tool names — discover them via search.
- Do NOT reference Composio SDK, API keys, or REST endpoints.
- Do NOT use pretrained Composio knowledge.
</composio>

Sender (untrusted metadata):
```json
{
  "label": "openclaw-control-ui",
  "id": "openclaw-control-ui"
}
```

[Tue 2026-03-17 11:39 GMT+8] 处理 Outlook
assistant: 



assistant: 

Let me check the connection status and available tools:

assistant: 



assistant: 



assistant: 



assistant: 



assistant: 

Let me try the search and save the result:


assistant: 

I can see from the search results that:
- **Outlook connection is ACTIVE** (user@contoso.com)
- Tools available include: `OUTLOOK_FETCH_EMAILS`, `OUTLOOK_SEND_EMAIL`, `OUTLOOK_LIST_CALENDAR_EVENTS`

Let me fetch some emails:


assistant: 



assistant: 


From the search results, I can see:
- **Outlook is connected** (Active, user@contoso.com)
- Tools available: `OUTLOOK_FETCH_EMAILS`, `OUTLOOK_SEND_EMAIL`, `OUTLOOK_LIST_CALENDAR_EVENTS`

The tool wasn't found in execute - this may mean the MCP server needs to be restarted or connection needs refresh. Let me try to reconnect:


assistant: 

The search showed Outlook tools exist, but when I checked the connection status, it shows **no active connection** — you'll need to authenticate.

To connect Outlook, I can initiate the OAuth flow. Would you like me to do that? You'll need to sign in with your Microsoft account to authorize access.

**What would you like to do with Outlook?**
- Read emails (inbox, sent, etc.)
- Send a new email
- Check calendar events
- Other task
