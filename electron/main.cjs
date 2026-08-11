const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

// 패키징된 앱에서는 process.resourcesPath 아래, 개발 중에는 프로젝트 루트의 resources/ 아래를 사용
function resourcePath(...parts) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "resources");
  return path.join(base, ...parts);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  ipcMain.handle("pick-image", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "계통도 이미지", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("convert-image", async (event, imagePath) => {
    const pipelineExe = resourcePath("pipeline", "pipeline.exe");
    const tesseractExe = resourcePath("tesseract", "tesseract.exe");
    const tessdataDir = resourcePath("tesseract", "tessdata");

    if (!fs.existsSync(pipelineExe)) {
      throw new Error(
        `변환 엔진을 찾을 수 없습니다: ${pipelineExe}\n(개발 모드에서는 이 기능이 동작하지 않습니다. 패키징된 exe에서만 사용 가능합니다.)`
      );
    }

    const outDir = path.join(os.tmpdir(), `kgrid_${Date.now()}`);
    fs.mkdirSync(outDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const proc = spawn(pipelineExe, [imagePath, outDir], {
        env: {
          ...process.env,
          PIPELINE_TESSERACT_CMD: tesseractExe,
          TESSDATA_PREFIX: tessdataDir,
          PYTHONIOENCODING: "utf-8",
        },
        windowsHide: true,
      });

      let stderrBuf = "";
      proc.stdout.on("data", (d) => {
        const line = d.toString("utf-8");
        event.sender.send("convert-progress", line);
      });
      proc.stderr.on("data", (d) => {
        stderrBuf += d.toString("utf-8");
      });
      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`변환 프로세스가 오류로 종료됐습니다 (code ${code})\n${stderrBuf}`));
          return;
        }
        const outPath = path.join(outDir, "03_editor_import.json");
        try {
          const json = JSON.parse(fs.readFileSync(outPath, "utf-8"));
          resolve(json);
        } catch (e) {
          reject(new Error(`결과 JSON을 읽는 데 실패했습니다: ${e.message}`));
        }
      });
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
