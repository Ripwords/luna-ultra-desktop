//! Live preview transport.
//!
//! Asks the camera to start a preview stream over the control session that
//! already exists, then re-serves the resulting elementary stream on an
//! ephemeral localhost port. The frontend consumes that with `fetch` and
//! decodes via WebCodecs, which keeps video-rate traffic off the Tauri IPC
//! bridge and avoids the `blob:` URL decoding limitation in WKWebView.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::luna::{
    wire_field_varint, LunaState, Session, CODE_START_LIVE_STREAM, CODE_STOP_LIVE_STREAM,
};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

/// StartLiveStream, per `insta360.messages.StartLiveStream`:
///   2 enableVideo, 6 videoBitrate, 7 resolution, 8 enableGyro,
///   9 videoBitrate1, 10 resolution1
/// Resolution 9 is RES_1440_720P30 and 18 is RES_480_240P30, matching the
/// known-good capture. Values are deliberately identical to that capture so
/// that a failure here means the camera disagrees, not that we guessed.
fn build_start_live_stream_body() -> Vec<u8> {
    let mut body = wire_field_varint(2, 1);
    body.extend(wire_field_varint(6, 40));
    body.extend(wire_field_varint(7, 9));
    body.extend(wire_field_varint(8, 1));
    body.extend(wire_field_varint(9, 40));
    body.extend(wire_field_varint(10, 18));
    body
}

fn response_head() -> Vec<u8> {
    concat!(
        "HTTP/1.1 200 OK\r\n",
        "Content-Type: application/octet-stream\r\n",
        "Cache-Control: no-store\r\n",
        "Access-Control-Allow-Origin: *\r\n",
        "Connection: close\r\n\r\n"
    )
    .as_bytes()
    .to_vec()
}

/// Counters so a failed run explains itself instead of showing a blank canvas.
#[derive(Default)]
struct Stats {
    bytes: AtomicU64,
    frames: AtomicU64,
    first_bytes: StdMutex<Vec<u8>>,
    started: StdMutex<Option<Instant>>,
}

#[derive(Default)]
pub struct LiveViewState {
    inner: Mutex<Option<Running>>,
}

struct Running {
    port: u16,
    stats: Arc<Stats>,
    server: JoinHandle<()>,
    recorder: JoinHandle<()>,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.server.abort();
        self.recorder.abort();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveViewInfo {
    pub url: String,
    pub port: u16,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveViewStats {
    pub bytes: u64,
    pub frames: u64,
    pub first_bytes_hex: String,
    pub seconds: f64,
}

/// Serve the elementary stream to whichever client connects. Each connection
/// gets its own subscription, so a page reload simply picks up the live edge.
async fn serve(listener: TcpListener, session: Arc<Session>) {
    loop {
        let Ok((mut socket, _)) = listener.accept().await else { break };
        let mut receiver = session.subscribe_stream();
        tokio::spawn(async move {
            // Read and discard the request line; we serve one thing.
            let mut scratch = [0u8; 1024];
            let _ = socket.read(&mut scratch).await;
            if socket.write_all(&response_head()).await.is_err() {
                return;
            }
            loop {
                match receiver.recv().await {
                    Ok(payload) => {
                        if socket.write_all(&payload).await.is_err() {
                            break;
                        }
                    }
                    // A slow client drops frames and keeps going
                    Err(RecvError::Lagged(_)) => continue,
                    Err(RecvError::Closed) => break,
                }
            }
        });
    }
}

#[tauri::command]
pub async fn luna_liveview_start(
    luna: State<'_, LunaState>,
    live: State<'_, LiveViewState>,
) -> Result<LiveViewInfo, String> {
    let session = luna
        .session()
        .await
        .ok_or_else(|| "camera is not connected".to_string())?;

    let mut guard = live.inner.lock().await;
    if let Some(running) = guard.as_ref() {
        return Ok(LiveViewInfo {
            url: format!("http://127.0.0.1:{}/stream", running.port),
            port: running.port,
        });
    }

    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("cannot open the local stream port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("cannot read the local stream port: {e}"))?
        .port();

    let stats = Arc::new(Stats::default());
    *stats.started.lock().unwrap() = Some(Instant::now());

    // Count independently of whether a client is attached, so "the camera
    // sent nothing" and "the browser never connected" stay distinguishable.
    let recorder_stats = Arc::clone(&stats);
    let mut recorder_rx = session.subscribe_stream();
    let recorder = tokio::spawn(async move {
        loop {
            match recorder_rx.recv().await {
                Ok(payload) => {
                    recorder_stats.bytes.fetch_add(payload.len() as u64, Ordering::Relaxed);
                    recorder_stats.frames.fetch_add(1, Ordering::Relaxed);
                    let mut first = recorder_stats.first_bytes.lock().unwrap();
                    if first.is_empty() {
                        *first = payload.iter().copied().take(64).collect();
                    }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            }
        }
    });

    let server = tokio::spawn(serve(listener, Arc::clone(&session)));

    session
        .send_command(CODE_START_LIVE_STREAM, &build_start_live_stream_body(), COMMAND_TIMEOUT)
        .await
        .map_err(|e| format!("camera rejected START_LIVE_STREAM: {e}"))?;

    *guard = Some(Running { port, stats, server, recorder });
    Ok(LiveViewInfo { url: format!("http://127.0.0.1:{port}/stream"), port })
}

#[tauri::command]
pub async fn luna_liveview_stop(
    luna: State<'_, LunaState>,
    live: State<'_, LiveViewState>,
) -> Result<(), String> {
    // Drop the server first so the socket closes even if the camera is gone
    live.inner.lock().await.take();
    if let Some(session) = luna.session().await {
        let _ = session.send_command(CODE_STOP_LIVE_STREAM, &[], COMMAND_TIMEOUT).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn luna_liveview_stats(live: State<'_, LiveViewState>) -> Result<LiveViewStats, String> {
    let guard = live.inner.lock().await;
    let Some(running) = guard.as_ref() else { return Ok(LiveViewStats::default()) };
    let first = running.stats.first_bytes.lock().unwrap().clone();
    let seconds = running
        .stats
        .started
        .lock()
        .unwrap()
        .map(|at| at.elapsed().as_secs_f64())
        .unwrap_or_default();
    Ok(LiveViewStats {
        bytes: running.stats.bytes.load(Ordering::Relaxed),
        frames: running.stats.frames.load(Ordering::Relaxed),
        first_bytes_hex: first.iter().map(|b| format!("{b:02x}")).collect(),
        seconds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The body must match the capture from published reverse-engineering
    /// work byte for byte: enableVideo, videoBitrate 40, resolution 9
    /// (RES_1440_720P30), enableGyro, videoBitrate1 40, resolution1 18.
    #[test]
    fn start_live_stream_body_matches_known_capture() {
        let expected: Vec<u8> = vec![
            0x10, 0x01, 0x30, 0x28, 0x38, 0x09, 0x40, 0x01, 0x48, 0x28, 0x50, 0x12,
        ];
        assert_eq!(build_start_live_stream_body(), expected);
    }

    #[test]
    fn http_response_head_declares_a_streaming_body() {
        let head = String::from_utf8(response_head()).unwrap();
        assert!(head.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(head.contains("Content-Type: application/octet-stream"));
        assert!(head.contains("Access-Control-Allow-Origin: *"));
        assert!(head.ends_with("\r\n\r\n"));
    }
}
