import sys
print("Starting test server...", flush=True)
try:
    import uvicorn
    from fastapi import FastAPI
    print("Imports successful", flush=True)
except ImportError as e:
    print(f"Import failed: {e}", flush=True)
    sys.exit(1)

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello World"}

if __name__ == "__main__":
    print("Running uvicorn...", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=8000)
