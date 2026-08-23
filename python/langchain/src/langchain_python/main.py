from typing import Annotated, AsyncIterator, List
from typing_extensions import TypedDict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    trim_messages,
)
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import (
    ChatPromptTemplate,
    MessagesPlaceholder,
    PromptTemplate,
)
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="langchain", description="LangChain concept demos — one route per concept.")

# ---------------------------------------------------------------------------
# Shared pieces — one model, many demos.
#
# Mirrors ts/langchain/server.ts: each route demonstrates exactly one concept so
# it can be used as a reference for future projects. Every route takes a JSON
# body (a Pydantic request model), matching the TS req.body behaviour.
#   0. /                       — index of all routes
#   1. /messages               — message roles (System/Human/AI/Tool)
#   2. /prompt                 — string PromptTemplate
#   3. /chat-prompt            — ChatPromptTemplate + MessagesPlaceholder
#   4. /structured             — with_structured_output (typed response)
#   5. /chain                  — LCEL: .pipe() / RunnableSequence
#   6. /lc                     — Runnable primitives (Passthrough/Lambda)
#   7. /stream                 — streaming tokens
#   8. /tools                  — tool calling (@tool + bind_tools)
#   9. /memory                 — LangGraph StateGraph + MemorySaver
#  10. /trim                   — trim_messages on a growing history
# ---------------------------------------------------------------------------

# GPT-4o is a good default. temperature 0.7 for chat, 0 for structured/tool
# tasks where the *shape* matters more than the wording.
model = ChatOpenAI(model="gpt-4o", temperature=0.7)

# Deterministic model for structured output and tool calling.
strict_model = ChatOpenAI(model="gpt-4o", temperature=0)


# ---------------------------------------------------------------------------
# Request models (JSON bodies — FastAPI treats bare scalars as query params)
# ---------------------------------------------------------------------------


class MessagesRequest(BaseModel):
    message: str = "Explain it briefly."


class PromptRequest(BaseModel):
    topic: str = "vectors"
    audience: str = "beginners"


class ChatPromptRequest(BaseModel):
    message: str = "What is the difference between RAG and fine-tuning?"
    role: str = "tutor"


class StructuredRequest(BaseModel):
    question: str = "In one sentence, what is a vector database?"


class ChainRequest(BaseModel):
    topic: str = "MCP"


class LcRequest(BaseModel):
    word: str = "synergy"


class StreamRequest(BaseModel):
    message: str = "Count from 1 to 5, one number per line."


class ToolsRequest(BaseModel):
    message: str = "What is 7 times 8?"


class MemoryRequest(BaseModel):
    message: str
    skill: str = "nodejs"
    thread_id: str = "assistant"


class TrimMessage(BaseModel):
    role: str
    content: str


class TrimRequest(BaseModel):
    history: list[TrimMessage] = []


# ---------------------------------------------------------------------------
# 0. Index
# ---------------------------------------------------------------------------


@app.get("/")
def index() -> dict:
    return {
        "name": "langchain",
        "description": "LangChain concept demos — one route per concept.",
        "routes": [
            "/messages",
            "/prompt",
            "/chat-prompt",
            "/structured",
            "/chain",
            "/lc",
            "/stream",
            "/tools",
            "/memory",
            "/trim",
        ],
    }


# ---------------------------------------------------------------------------
# 1. Messages — roles and content
# ---------------------------------------------------------------------------


@app.post("/messages")
async def messages(req: MessagesRequest) -> dict:
    messages: list[BaseMessage] = [
        SystemMessage("You are a terse, confident senior engineer."),
        HumanMessage(req.message),
    ]
    response = await model.ainvoke(messages)
    return {"roles": [m.__class__.__name__ for m in messages], "response": response.content}


# ---------------------------------------------------------------------------
# 2. PromptTemplate — string prompt with a variable
# ---------------------------------------------------------------------------


@app.post("/prompt")
async def prompt(req: PromptRequest) -> dict:
    prompt = PromptTemplate.from_template(
        "Write a short intro to {topic} for {audience}. Keep it to three sentences."
    )
    chain = prompt | model | StrOutputParser()
    output = await chain.ainvoke({"topic": req.topic, "audience": req.audience})
    return {"prompt": prompt.format(topic=req.topic, audience=req.audience), "output": output}


# ---------------------------------------------------------------------------
# 3. ChatPromptTemplate + MessagesPlaceholder — structured chat prompt
# ---------------------------------------------------------------------------


@app.post("/chat-prompt")
async def chat_prompt(req: ChatPromptRequest) -> dict:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are a {role} who explains with an analogy."),
            MessagesPlaceholder("history"),
            ("user", "{message}"),
        ]
    )
    chain = prompt | model | StrOutputParser()
    output = await chain.ainvoke({"role": req.role, "message": req.message, "history": []})
    return {"output": output}


# ---------------------------------------------------------------------------
# 4. Structured output — enforce a JSON schema
# ---------------------------------------------------------------------------


class StructuredAnswer(BaseModel):
    answer: str
    confidence: float


@app.post("/structured")
async def structured(req: StructuredRequest) -> StructuredAnswer:
    structured_model = strict_model.with_structured_output(StructuredAnswer)
    response = await structured_model.ainvoke(req.question)
    return response


# ---------------------------------------------------------------------------
# 5. LCEL — composing runnables with | (pipe) and RunnableSequence
# ---------------------------------------------------------------------------


@app.post("/chain")
async def chain(req: ChainRequest) -> dict:
    prompt = PromptTemplate.from_template("Define {topic} in exactly one sentence.")
    chain = prompt | model | StrOutputParser()
    output = await chain.ainvoke({"topic": req.topic})
    return {"output": output}


# ---------------------------------------------------------------------------
# 6. Runnable primitives — passthrough and lambda
# ---------------------------------------------------------------------------


@app.post("/lc")
async def lc(req: LcRequest) -> dict:
    echo_and_count = RunnablePassthrough.assign(
        length=RunnableLambda(lambda input: len(input["word"])),
        upper=RunnableLambda(lambda input: input["word"].upper()),
    )
    result = await echo_and_count.ainvoke({"word": req.word})
    return dict(result)


# ---------------------------------------------------------------------------
# 7. Streaming — consume tokens as they're generated
# ---------------------------------------------------------------------------


@app.post("/stream")
async def stream(req: StreamRequest) -> StreamingResponse:
    prompt = PromptTemplate.from_template("{message}")
    chain = prompt | strict_model | StrOutputParser()

    async def token_stream() -> AsyncIterator[str]:
        async for chunk in chain.astream({"message": req.message}):
            yield chunk

    return StreamingResponse(token_stream(), media_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------------------
# 8. Tool calling — let the model invoke functions
# ---------------------------------------------------------------------------


@tool
def multiply(a: int, b: int) -> str:
    """Multiply two numbers. Call this when the user asks for a product."""
    return str(a * b)


@tool
def add(a: int, b: int) -> str:
    """Add two numbers. Call this when the user asks for a sum."""
    return str(a + b)


tools = [multiply, add]


@app.post("/tools")
async def tools_route(req: ToolsRequest) -> dict:
    tool_model = strict_model.bind_tools(tools)
    messages: list[BaseMessage] = [HumanMessage(req.message)]

    for step in range(10):
        ai_message = await tool_model.ainvoke(messages)
        messages.append(ai_message)

        # No tool calls → the model is done; return the final text.
        if not ai_message.tool_calls:
            return {"messages": len(messages), "steps": step + 1, "answer": ai_message.content}

        # Execute each requested tool and feed the ToolMessage back.
        for call in ai_message.tool_calls:
            found = next((t for t in tools if t.name == call["name"]), None)
            result = "unknown tool"
            if found is not None:
                result = await found.ainvoke(call["args"])
            messages.append(ToolMessage(tool_call_id=call["id"], content=str(result)))

    raise HTTPException(status_code=400, detail="Tool loop exceeded max steps")


# ---------------------------------------------------------------------------
# 9. Memory — LangGraph StateGraph + MemorySaver
# ---------------------------------------------------------------------------


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]
    skill: str
    message: str


# The graph node function: receives state, returns a partial state update.
def call_model(state: GraphState) -> dict:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are an assistant who is good at {skill}."),
            MessagesPlaceholder("messages"),
        ]
    )
    chain = prompt | model
    response = chain.invoke({"skill": state["skill"], "messages": state["messages"]})
    return {"messages": [AIMessage(content=response.content)]}


workflow = StateGraph(GraphState)
workflow.add_node("model", call_model)
workflow.add_edge(START, "model")

# In-memory checkpointer. Swap for a persistent saver (e.g. SqliteSaver) to
# survive restarts. thread_id is the conversation key.
memory = MemorySaver()
memory_graph = workflow.compile(checkpointer=memory)


@app.post("/memory")
async def memory_route(req: MemoryRequest) -> dict:
    config = {"configurable": {"thread_id": req.thread_id}}
    result = memory_graph.invoke({"messages": [HumanMessage(req.message)], "skill": req.skill}, config)
    return {"response": result["messages"][-1].content}


# ---------------------------------------------------------------------------
# 10. trim_messages — bounds a growing message list
# ---------------------------------------------------------------------------


@app.post("/trim")
async def trim(req: TrimRequest) -> dict:
    messages: list[BaseMessage] = [SystemMessage("You are a helpful assistant.")]
    for m in req.history:
        messages.append(HumanMessage(m.content) if m.role == "user" else AIMessage(m.content))

    def token_counter(msgs: List[BaseMessage]) -> int:
        return -(-sum(len(str(m.content)) for m in msgs) // 4)

    trimmed = trim_messages(
        messages,
        max_tokens=40,
        strategy="last",
        token_counter=token_counter,
        include_system=True,
        start_on="human",
        allow_partial=True,
    )
    return {"original": len(messages), "remaining": len(trimmed)}
