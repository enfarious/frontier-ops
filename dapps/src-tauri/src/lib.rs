use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Proxy LLM requests to avoid CORS — the killer feature of the desktop app.
/// Accepts any OpenAI-compatible endpoint and forwards the request.
#[derive(Deserialize)]
struct LlmProxyRequest {
    url: String,
    body: String,
    api_key: Option<String>,
}

#[derive(Serialize)]
struct LlmProxyResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn llm_proxy(request: LlmProxyRequest) -> Result<LlmProxyResponse, String> {
    let client = reqwest::Client::new();

    let mut req = client
        .post(&request.url)
        .header("Content-Type", "application/json")
        .body(request.body);

    if let Some(key) = &request.api_key {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;

    Ok(LlmProxyResponse { status, body })
}

/// Get app version
#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![llm_proxy, get_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
