# ccr-plugin-structured-outputs

A [claude-code-router](https://github.com/musistudio/claude-code-router) plugin
that restores **structured outputs** (JSON Schema) when routing Anthropic
Messages API requests to OpenAI-compatible backends (GLM, DeepSeek, Groq,
vLLM, Ollama, etc.).

## The problem

Anthropic's Messages API gained structured outputs in GA on
[2025-11-14](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
A request looks like:

```json
{
  "model": "claude-opus-4-7",
  "messages": [{ "role": "user", "content": "..." }],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": { "type": "object", "properties": { ... }, "required": [...] }
    }
  }
}
```

`claude-code-router` (CCR) routes Anthropic-format requests to OpenAI-compatible
backends, but its built-in `AnthropicTransformer` **silently drops both
`output_config` (GA) and `output_format` (beta)**. The backend never sees
the schema, and the response degrades to free-form text — defeating the
whole point of structured outputs.

This plugin closes the gap by translating either field into OpenAI's
[`response_format`](https://platform.openai.com/docs/guides/structured-outputs),
which OpenAI-compatible backends already understand.

> An upstream fix is proposed in
> [musistudio/claude-code-router#1380](https://github.com/musistudio/claude-code-router/pull/1380).
> Use this plugin while waiting for it (or indefinitely — the plugin is
> small enough that it has no real maintenance burden).

## Install

1. Drop `outputconfig.transformer.js` into your CCR plugins directory
   (typically `~/.claude-code-router/plugins/`):

   ```bash
   curl -fsSL -o ~/.claude-code-router/plugins/outputconfig.transformer.js \
     https://raw.githubusercontent.com/idemerge/ccr-plugin-structured-outputs/main/outputconfig.transformer.js
   ```

2. Register the plugin and enable it on your provider in
   `~/.claude-code-router/config.json`:

   ```jsonc
   {
     "transformers": [
       {
         "name": "outputConfig",
         "path": "/root/.claude-code-router/plugins/outputconfig.transformer.js",
         "options": {}
       }
     ],
     "Providers": [
       {
         "name": "GLM-5",
         "api_base_url": "https://your-backend/v1/chat/completions",
         "api_key": "...",
         "models": ["glm-5"],
         "transformer": {
           "use": ["outputConfig"]
         }
       }
     ]
   }
   ```

3. Restart CCR.

## Verify

```bash
curl -s http://127.0.0.1:3456/v1/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_CCR_KEY' \
  -d '{
    "model": "glm-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "List 3 EU capitals."}],
    "output_config": {
      "format": {
        "type": "json_schema",
        "schema": {
          "type": "object",
          "additionalProperties": false,
          "required": ["capitals"],
          "properties": {
            "capitals": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["country", "capital"],
                "properties": {
                  "country": {"type": "string"},
                  "capital": {"type": "string"}
                }
              }
            }
          }
        }
      }
    }
  }'
```

Expected `content[0].text` is a JSON string parseable into the schema, e.g.:

```json
{"capitals":[
  {"country":"France","capital":"Paris"},
  {"country":"Germany","capital":"Berlin"},
  {"country":"Italy","capital":"Rome"}
]}
```

Without the plugin you'd get a Markdown bullet list instead.

## What the plugin does (and doesn't)

- ✅ Translates `output_config.format` (GA) and `output_format` (beta) into
  OpenAI `response_format`.
- ✅ Supports `json_schema`, `json_object`, and `text` types.
- ✅ Defaults `strict: true` to mirror Anthropic's guarantee semantics; the
  client can opt out with `strict: false`.
- ❌ Does not validate that the backend you've configured supports
  `response_format`. Most OpenAI-compatible backends do; some don't.
- ❌ Does not modify response handling. CCR's existing OpenAI → Anthropic
  response converter wraps the JSON string into `content[0].text`, which is
  exactly what Anthropic's GA spec returns.

## How it works

CCR's built-in `AnthropicTransformer.transformRequestOut` is called first
on the incoming `/v1/messages` request and produces a `UnifiedChatRequest`
in OpenAI shape — but it strips `output_config` / `output_format` along the
way. Provider-level `transformRequestIn` plugins run next, and CCR passes
them a `context.req.body` reference that **still contains the original
Anthropic-shaped request body**.

This plugin reads `context.req.body.output_config?.format` (or
`context.req.body.output_format`), translates it into the OpenAI
`response_format` shape, and attaches it to the outgoing request body.
That's it — about thirty lines of code.

## License

[MIT](./LICENSE)
