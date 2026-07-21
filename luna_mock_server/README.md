# Luna Mock Server

Protocol emulator for the Insta360 Luna Ultra, vendored from
[diamondfsd/luna-ai-cut](https://github.com/diamondfsd/luna-ai-cut)
(`luna_mock_server/`), with the device config inlined as `luna-ultra.json`.
It speaks the same TCP control protocol (UCD2 auth, delete commands) and
serves the same HTTP media index as the real camera.

Used for development and by the Rust integration test
(`src-tauri/tests/mock_camera.rs`). Start it manually with:

```bash
node luna_mock_server/server.mjs --root /path/to/media --host 127.0.0.1 --http-port 18080 --tcp-port 6666
```

Then connect the app to host `127.0.0.1:18080` from the Connect page.
