# Chromadb
This is design to run from pnpm workspace. There is no need to run it separately. All commands are available in root package.json. Some npm modules are comming from root package.json. If you want to run it separately, you can run it from chromadb directory with installing npm modules from chromadb directory.

## How to run
```bash
# Run chromadb server
$ docker-compose up -d

# Update .env file

# Intall node modules from root
$ pnpm install

# Run server from root
$ pnpm dev:chromadb
```

## API Documentation
Run the following URL from the browser

http://localhost:8000/docs
