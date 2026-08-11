const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  pickImage: () => ipcRenderer.invoke("pick-image"),
  convertImage: (imagePath) => ipcRenderer.invoke("convert-image", imagePath),
  onConvertProgress: (callback) => {
    const listener = (_event, line) => callback(line);
    ipcRenderer.on("convert-progress", listener);
    return () => ipcRenderer.removeListener("convert-progress", listener);
  },
});
