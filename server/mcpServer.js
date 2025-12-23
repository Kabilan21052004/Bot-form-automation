const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const queueManager = require("./queueManager");

const server = new Server(
    {
        name: "form-automation",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Handler for listing available tools.
 * Exposes tools to submit a form job and check its status.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "submit_form",
                description: "Submit a new form-filling automation task. After calling this, you MUST periodically call 'check_status' to see if more information is needed or if the task is complete.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL of the form to fill (e.g., Google Form URL)",
                        },
                        formData: {
                            type: "object",
                            description: "The JSON data to fill into the form fields.",
                        },
                    },
                    required: ["url", "formData"],
                },
            },
            {
                name: "check_status",
                description: "Check the status and logs of a task. If the status is 'waiting_input', you MUST ask the user the provided question and then call 'provide_missing_data'.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "The ID of the task to check.",
                        },
                    },
                    required: ["taskId"],
                },
            },
            {
                name: "provide_missing_data",
                description: "Provide the missing value for a task that is currently waiting for input.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "The ID of the task that is waiting for input.",
                        },
                        value: {
                            type: "string",
                            description: "The value to provide for the missing field.",
                        },
                    },
                    required: ["taskId", "value"],
                },
            },
        ],
    };
});

/**
 * Handler for tool calls.
 * Routes form submissions and status checks to the QueueManager.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "submit_form") {
            const { url, formData } = args;
            const task = queueManager.addTask(url, formData);
            return {
                content: [
                    {
                        type: "text",
                        text: `Task submitted. Task ID: ${task.id}. Status: ${task.status}\n\nINSTRUCTION: Please Wait ~10 seconds and then call 'check_status' with this ID to see if I need more information from you or if the task is done.`,
                    },
                ],
            };
        } else if (name === "check_status") {
            const { taskId } = args;
            const queue = queueManager.getQueueStatus();
            const task = queue.find((t) => t.id === taskId);

            if (!task) {
                return {
                    content: [{ type: "text", text: `Task with ID ${taskId} not found.` }],
                    isError: true,
                };
            }

            const logsSummary = task.logs.slice(-5).join("\n");
            let responseText = `Task ID: ${task.id}\nStatus: ${task.status}\nRecent Logs:\n${logsSummary || "No logs yet."}`;

            if (task.status === 'waiting_input' && task.currentQuestion) {
                responseText += `\n\nACTION REQUIRED: The automation is paused. ${task.currentQuestion}\nPlease use the 'provide_missing_data' tool to answer.`;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: responseText,
                    },
                ],
            };
        } else if (name === "provide_missing_data") {
            const { taskId, value } = args;
            const queue = queueManager.getQueueStatus();
            const task = queue.find((t) => t.id === taskId);

            if (!task || task.status !== 'waiting_input') {
                return {
                    content: [{ type: "text", text: `Task with ID ${taskId} is not currently waiting for input.` }],
                    isError: true,
                };
            }

            queueManager.resolvePendingInput(value);
            return {
                content: [
                    {
                        type: "text",
                        text: `Input provided successfully. Task ${taskId} will now resume.`,
                    },
                ],
            };
        } else {
            throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

/**
 * Start the server using Stdio transport.
 * This allows the server to communicate with an MCP client (like Claude Desktop).
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Form Automation MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
