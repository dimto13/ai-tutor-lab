const crypto = require("node:crypto");
const path = require("node:path");
const vscode = require("vscode");

const source = "real-editor-runtime-spike";

function activate(context) {
  const endpoint = process.env["AI_TUTOR_EVENT_ENDPOINT"];
  const token = process.env["AI_TUTOR_EVENT_TOKEN"];
  const sessionId = process.env["AI_TUTOR_SESSION_ID"];
  if (!endpoint || !token || !sessionId) return;

  const emit = async (type, payload = {}) => {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          source,
          type,
          timestamp: new Date().toISOString(),
          sessionId,
          payload,
        }),
      });
    } catch (error) {
      console.error("AI Tutor runtime bridge could not deliver metadata", error);
    }
  };

  let lastOpenedUri;
  const emitFileOpened = (document) => {
    const uri = document.uri.toString();
    if (uri === lastOpenedUri) return;
    lastOpenedUri = uri;
    void emit("file.opened", {
      filename: path.basename(document.uri.fsPath),
      uriScheme: document.uri.scheme,
    });
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(emitFileOpened),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) emitFileOpened(editor.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      void emit("file.saved", {
        filename: path.basename(document.uri.fsPath),
        uriScheme: document.uri.scheme,
      });
    }),
    vscode.window.onDidOpenTerminal(() => {
      void emit("terminal.opened");
    }),
  );

  void emit("runtime.ready", {
    openDocumentCount: vscode.workspace.textDocuments.length,
  });
  if (vscode.window.activeTextEditor) emitFileOpened(vscode.window.activeTextEditor.document);
}

function deactivate() {}

module.exports = { activate, deactivate };
