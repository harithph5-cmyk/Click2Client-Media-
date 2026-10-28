# Function / Tool Calling

| Field | Value |
|---|---|
| Document ID | BASHA-AI-003 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S30 (OpenAI function calling guide, no date shown) and S31 (Anthropic tool use overview, no date shown). Gemini function calling is implemented in the live Baasha AI agent but its Google documentation page was not re-read in this research pass. Pricing and model names are deliberately not recorded (they change). |

## Facts
- **[FACT, S30]** Flow: define tools (name, description, JSON Schema `parameters`, `strict`); the model returns `function_call` items (`call_id`, `name`, JSON `arguments`); your application executes; you return a `function_call_output` with the same `call_id`. `strict: true` makes calls adhere to the schema (requires `additionalProperties: false` and all properties required, optional via `null` type). The model may issue **parallel** calls; `parallel_tool_calls: false` limits to at most one. `tool_choice`, tool search for large toolsets and custom tools exist.
- **[FACT, S31]** Client tools run in your application (`stop_reason: "tool_use"`, return `tool_result`); server tools (web search/fetch, code execution) run on the provider. `tool_choice` supports `auto` and forced tool use; `disable_parallel_tool_use` is available. Strict tool use exists for schema conformance. If required parameters are missing, behaviour varies by model: some ask, some infer values, "not guaranteed". Server tools may add usage-based charges.

## Design rules for Basha [PROPOSED]
1. **Direct tool-calling loop, no agent framework**, is the simplest architecture that meets the current needs: one orchestrator function, a typed tool registry, a step cap, a time budget, and a database-backed task record. This is how the live Baasha AI agent works (plan, tool loop, verify; 8 steps; 90 s budget). Add a workflow engine only when tasks must survive restarts or run for hours (see 05_BACKGROUND_JOBS, planned).
2. Validate every argument in code regardless of `strict`; unknown tool names are rejected.
3. Execute calls **sequentially** for write tools; parallel only for independent read-only tools.
4. Tool results go back as data with `ok`, `category`, `error`; failures include an instruction that the tool failed (this stops the model from claiming success).
5. Missing required inputs: ask the user (do not let the model guess values for writes).
6. Idempotency key per write; the orchestrator, not the model, decides retries.
7. Keep tool descriptions short, specific, and aligned with the registry; do not expose PROPOSED tools to the model.
8. Provider switching: keep an internal tool schema and translate per provider; test each provider against the same scenarios (TESTING_AND_EVALUATION).

## Detection / verification
Contract tests: for each tool, schema validation, error mapping, timeout, and idempotent retry. Evaluation: tool-call success rate, wrong-tool rate, invalid-argument rate.

## Errors
Provider quota/auth errors are categorised and not retried when permanent (AGENT_OPERATING_RULES/06).

## Limitations
Provider API details change; re-read S30/S31 at integration time.

## Sources
S30, S31.
