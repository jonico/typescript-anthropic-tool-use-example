import dotenv from "dotenv";
import { input } from "@inquirer/prompts";
import {
  MessageParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import net from 'net';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z, ZodTypeAny } from 'zod';
import express, { Express } from "express";
dotenv.config();

import { tools, functions, zodSchemas } from "./tools";

// AWS Bedrock client configuration
const createBedrockClient = () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION;

  if (!accessKeyId || !secretAccessKey || !region) {
    return null;
  }

  return new BedrockRuntimeClient({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region,
  });
};

// Function to invoke Claude via Bedrock
const invokeBedrockClaude = async (
  client: BedrockRuntimeClient,
  messages: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>,
  tools: Anthropic.Tool[]
) => {
  const input = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    messages,
    tools
  };

  const command = new InvokeModelCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    body: JSON.stringify(input),
    contentType: "application/json",
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody;
  } catch (error) {
    console.error("Error invoking Bedrock Claude:", error);
    throw error;
  }
};

// Modified main client creation logic
const createClient = () => {
  const bedrockClient = createBedrockClient();
  if (bedrockClient) {
    console.log("Using AWS Bedrock for Claude 3.5 Sonnet API");
    return {
      messages: {
        create: async (params: any) => {
          const response = await invokeBedrockClaude(
            bedrockClient,
            params.messages,
            params.tools || []
          );
          return response;
        },
      },
    };
  }

  console.log("Using direct Anthropic API");
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });
};

const messages: MessageParam[] = [];
const client = createClient();

function exit() {
  console.log("Ok, bye!");
  process.exit(0);
}

async function query() {
  const query = await input({ message: "What would you like to do?" });
  const trimmedQuery = query.trim();
  
  if (["quit", "exit"].includes(trimmedQuery.toLowerCase())) {
    exit();
  }
  return trimmedQuery;
}

async function callClaude(prompt: string | MessageParam[]) {
  if (Array.isArray(prompt)) {
    messages.push(...prompt);
  } else {
    messages.push({
      role: "user",
      content: prompt,
    });
  }

  return client.messages
    .create({
      model: process.env.AWS_ACCESS_KEY_ID ? 
        "anthropic.claude-3-5-sonnet-20241022-v2:0" :
        "claude-3-5-sonnet-latest",
      temperature: 0.95,
      max_tokens: 2048,
      messages: messages,
      tools: tools,
    })
    .then((response) => {
      messages.push({ role: "assistant", content: response.content });
      return response;
    });
}

async function callTool(toolBlock: ToolUseBlock) {
  const { name, id, input } = toolBlock;
  console.log('Available functions:', Object.keys(functions));
  console.log('Trying to call function:', name);

  const tool = tools.find((tool) => tool.name === name);
  if (tool) {
    const toolOutput = await functions[name](input);
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content: toolOutput,
        },
      ],
    } as MessageParam;
  } else {
    throw Error(`Tool ${name} does not exist`);
  }
}

async function processResponse(response: Anthropic.Messages.Message) {
  const toolUseBlocks = response.content.filter<ToolUseBlock>(
    (content) => content.type === "tool_use",
  );

  if (toolUseBlocks.length) {
    const allToolResultPromises = toolUseBlocks.map(async (toolBlock) => {
      return await callTool(toolBlock);
    });
    const allToolResults = await Promise.all(allToolResultPromises);

    return await callClaude(allToolResults) //
      .then(processResponse);
  } else {
    const textOutputs = response.content
      .map((content) => (content.type === "text" ? content.text : null))
      .filter(Boolean);
    console.log(textOutputs.join("\n"));
  }
}

// Add this utility function after the imports
type ContentWrapper = {
  content: Array<{
    type: "text";
    text: string;
  }>;
};

const wrapToolResponse = (result: any): ContentWrapper => {
  return {
    content: result
  };
};

async function main() {
  // Create Express app
  const app: Express = express();
  app.use(express.json());
  
  // Only parse JSON for non-message endpoints
  app.use((req, res, next) => {
    if (req.path !== '/message') {
      express.json()(req, res, next);
    } else {
      next();
    }
  });

  // Set up SSE endpoint with multiple transports
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    const mcpServer = new McpServer({
      name: "Postman Tools",
      version: "1.0.0"
    });
    
    // Register tools for this connection
    for (const tool of tools) {
      const func = functions[tool.name];
      const schema = zodSchemas[tool.name];
      if (func) {
        mcpServer.tool(
          tool.name,
          tool.description || tool.name,
          schema,
          async (...args) => wrapToolResponse(await func(...args))
        );
      }
    }
    
    const transport = new SSEServerTransport("/message", res);
    await mcpServer.connect(transport);
    
    const sessionId = transport.sessionId;
    console.log(`[SSE] New connection established: ${sessionId}`);
    transports.set(sessionId, transport);

    // Handle connection close and cleanup
    req.on('close', async () => {
      console.log(`[SSE] Connection closed: ${sessionId}`);
      await mcpServer.close();
      transports.delete(sessionId);
      await mcpServer.close();
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId as string;

    const transport = transports.get(sessionId);
    if (!transport) {
      console.log(`[SSE] Error: No transport found for session ${sessionId}`);
      res.status(400).json({ error: "No active transport" });
      return;
    }
    
    try {
      // log incoming message
      //console.log(`[SSE] Received message for ${sessionId}:`, req.body);
      await transport.handlePostMessage(req, res, req.body);
      
    } catch (error) {
      console.error(`[SSE] Error handling message for ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error handling message" });
      }
    }
  });

  // Start the Express server
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    console.log(`MCP Server running on port ${PORT}`);
  });

  // Handle server shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    server.close();
    process.exit(0);
  });

  // Continue with existing CLI loop
  while (true) {
    try {
      const userInput = await query();
      if (userInput === "") {
        console.log("Please enter a message.");
        continue;
      }
      
      const response = await callClaude(userInput);
      if (response) {
        await processResponse(response);
      }
    } catch (error) {
      console.error('Error communicating with Claude:', error.message);
      continue;
    }
  }
}

// Start the application with error handling
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

