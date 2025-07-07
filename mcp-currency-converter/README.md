# Currency Converter MCP Server

## How to test locally
- There are two ways to test this

1. Using modelcontextprotocol/inspector
```bash
# run pnpm inspector
# There is the URL generated in the console to invoke the GUI to test
```

2. Add module to pnpm registry
```bash
$ pnpm link --global

# check from anywhere it's install to global. This should return 
# /Users/xxxxx/Library/pnpm/mcp-currency-converter
$ which mcp-currency-converter

```

## MCP client flow with Langchain

User
 |
 | "Convert 100 USD to LKR"
 v
Express API / LangChain Agent (local)
 |
 | Load tools from MCP client
 |-------------------------->
 |                          |
 |    MultiServerMCPClient  |
 |                          |
 |<--------------------------
 |
 | Send prompt + tools to LLM
 |-------------------------->
 |                          |
 |      OpenAI (GPT-4o)     |
 |                          |
 |<--------------------------
 | tool_call = { name: ..., args: {...} }
 |
 | Execute tool function
 |-------------------------->
 |                          |
 |   MCP Tool Server (local CLI process)
 |                          |
 |<--------------------------
 | Result (converted amount)
 |
 | Send final answer to LLM for formatting (optional)
 |-------------------------->
 |<--------------------------
 v
Respond to User
