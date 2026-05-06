/**
 * ccr-plugin-structured-outputs
 *
 * Translates Anthropic's `output_config.format` (GA, since 2025-11-14) and
 * `output_format` (beta, with `anthropic-beta: structured-outputs-2025-11-13`)
 * into OpenAI's `response_format`, so OpenAI-compatible backends honor the
 * JSON Schema instead of returning free-form text.
 *
 * Refs:
 *   - https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 *   - https://platform.openai.com/docs/guides/structured-outputs
 *
 * License: MIT
 */
class OutputConfigTransformer {
    name = "outputConfig";

    constructor(options) {
        this.options = options || {};
    }

    async transformRequestIn(request, provider, context) {
        const body = typeof request === "string" ? JSON.parse(request) : { ...request };

        // CCR's built-in AnthropicTransformer strips output_config / output_format
        // before this hook runs, but `context.req.body` still references the
        // original Anthropic-shaped request body.
        const original = context?.req?.body;
        const fmt = original?.output_config?.format ?? original?.output_format;
        if (!fmt || !fmt.type) return body;

        if (fmt.type === "json_schema" && fmt.schema) {
            body.response_format = {
                type: "json_schema",
                json_schema: {
                    name: fmt.name || "response",
                    schema: fmt.schema,
                    strict: fmt.strict !== false,
                    ...(fmt.description ? { description: fmt.description } : {}),
                },
            };
            if (this.logger?.debug) {
                this.logger.debug(
                    { reqId: context?.req?.id, response_format: body.response_format },
                    "outputConfig: injected json_schema response_format"
                );
            }
        } else if (fmt.type === "json_object") {
            body.response_format = { type: "json_object" };
        } else if (fmt.type === "text") {
            body.response_format = { type: "text" };
        }

        return body;
    }
}

module.exports = OutputConfigTransformer;
