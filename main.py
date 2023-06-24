import json
from deepgram import Deepgram
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from typing import Dict, Callable

# from sentimiento import analysis
from sentiment import SentimentAnalyzer
from transformers import pipeline
from fastapi.staticfiles import StaticFiles
from typing import BinaryIO
from fastapi import HTTPException, status
import numpy as np
import torch
import torchaudio

import os
from io import BytesIO

audio_transcriber = pipeline(model="openai/whisper-base")

sentiment = SentimentAnalyzer()
#
# Install the assemblyai package by executing the command `pip3 install assemblyai` (macOS) or `pip install assemblyai` (Windows).

# Import the AssemblyAI module
import assemblyai as aai

# Your API token is already set here
aai.settings.api_key = "442b167280a148d48115314db48247d2"

# Create a transcriber object.
transcriber = aai.Transcriber()

# If you have a local audio file, you can transcribe it using the code below.
# Make sure to replace the filename with the path to your local audio file.
# Alternatively, if you have a URL to an audio file, you can transcribe it with the following code.
# Uncomment the line below and replace the URL with the link to your audio file.
# transcript = transcriber.transcribe("https://storage.googleapis.com/aai-web-samples/espn-bears.m4a")

# After the transcription is complete, the text is printed out to the console.
#


load_dotenv()

app = FastAPI()

dg_client = Deepgram(os.getenv("DEEPGRAM_API_KEY"))

templates = Jinja2Templates(directory="templates")

app.mount("/static", StaticFiles(directory="static"), name="static")


async def process_audio(fast_socket: WebSocket):
    async def get_transcript(data: Dict) -> None:
        if "channel" in data:
            transcript = data["channel"]["alternatives"][0]["transcript"]

            if transcript:
                result = sentiment.analysis(transcript)
                await fast_socket.send_text(
                    json.dumps({"transcript": transcript, "analysis": result.score})
                )

    deepgram_socket = await connect_to_deepgram(get_transcript)

    return deepgram_socket


async def connect_to_deepgram(transcript_received_handler: Callable[[Dict], None]):
    try:
        socket = await dg_client.transcription.live(
            {"punctuate": True, "interim_results": False}
        )
        socket.registerHandler(
            socket.event.CLOSE, lambda c: print(f"Connection closed with code {c}.")
        )
        socket.registerHandler(
            socket.event.TRANSCRIPT_RECEIVED, transcript_received_handler
        )

        return socket
    except Exception as e:
        raise Exception(f"Could not open socket: {e}")


@app.get("/", response_class=HTMLResponse)
def get(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/demo", response_class=HTMLResponse)
def get(request: Request):
    return templates.TemplateResponse("demo.html", {"request": request})


def send_bytes_range_requests(
    file_obj: BinaryIO, start: int, end: int, chunk_size: int = 10_000
):
    """Send a file in chunks using Range Requests specification RFC7233

    `start` and `end` parameters are inclusive due to specification
    """
    with file_obj as f:
        f.seek(start)
        while (pos := f.tell()) <= end:
            read_size = min(chunk_size, end + 1 - pos)
            yield f.read(read_size)


def _get_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    def _invalid_range():
        return HTTPException(
            status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail=f"Invalid request range (Range:{range_header!r})",
        )

    try:
        h = range_header.replace("bytes=", "").split("-")
        start = int(h[0]) if h[0] != "" else 0
        end = int(h[1]) if h[1] != "" else file_size - 1
    except ValueError:
        raise _invalid_range()

    if start > end or start < 0 or end > file_size - 1:
        raise _invalid_range()
    return start, end


def range_requests_response(request: Request, file_path: str, content_type: str):
    """Returns StreamingResponse using Range Requests of a given file"""

    file_size = os.stat(file_path).st_size
    range_header = request.headers.get("range")

    headers = {
        "content-type": content_type,
        "accept-ranges": "bytes",
        "content-encoding": "identity",
        "content-length": str(file_size),
        "access-control-expose-headers": (
            "content-type, accept-ranges, content-length, "
            "content-range, content-encoding"
        ),
    }
    start = 0
    end = file_size - 1
    status_code = status.HTTP_200_OK

    if range_header is not None:
        start, end = _get_range_header(range_header, file_size)
        size = end - start + 1
        headers["content-length"] = str(size)
        headers["content-range"] = f"bytes {start}-{end}/{file_size}"
        status_code = status.HTTP_206_PARTIAL_CONTENT

    return StreamingResponse(
        send_bytes_range_requests(open(file_path, mode="rb"), start, end),
        headers=headers,
        status_code=status_code,
    )


@app.get("/video")
def get_video(request: Request):
    return range_requests_response(
        request, file_path="static/out1.webm", content_type="video/webm"
    )


connected_clients = []


@app.websocket("/demo-listen")
async def websocket_endpoint(websocket: WebSocket):
    """Sends data down to the display server so it can update the speed of the video back and forth as well as the amount of connected clients
    """
    await websocket.accept()

    # We can try to only send the latest sentiment data
    try:
        while True:
            received = await websocket.receive_text()
            # print(received)
            await websocket.send_json(
                {"score": sentiment.score, "connectedClients": len(connected_clients)}
            )
    except Exception as e:
        raise Exception(f"Problem with the demo listen socket: {e}")
    finally:
        await websocket.close()


@app.websocket("/listen")
async def websocket_endpoint(websocket: WebSocket):
    """Listens to the clients that provide mic input.
    """
    await websocket.accept()

    connected_clients.append(websocket)

    try:
        deepgram_socket = await process_audio(websocket)

        while True:
            data = await websocket.receive_bytes()
            deepgram_socket.send(data)
    except Exception as e:
        raise Exception(f"Could not process audio: {e}")
    finally:
        connected_clients.remove(websocket)
        await websocket.close()
