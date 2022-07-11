import {contextBridge, ipcRenderer} from "electron";
import path from "path";
import fs from "fs";

namespace FileUtils {
    export function exists(path: string) {return fs.existsSync(path);}
    export function mkdir(path: string) {return fs.mkdirSync(path, {recursive: true});}
    export function readFile(path: string, encoding: "utf8" | "binary") {return fs.readFileSync(path, encoding);}
    export function getStats(path: string) {
        const stats = 
    }
};

namespace IPC {
    export function sendSync(cmd: string, ...args: any[]) {return ipcRenderer.sendSync(cmd, ...args);}
    export async function invoke(cmd: string, ...args: any[]) {return ipcRenderer.invoke(cmd, ...args);}
};

contextBridge.exposeInMainWorld("AstraNative", {
    path,
    __dirname,
    environment: path.dirname(__dirname) === "dist" ? "development" : "production",
    FileUtils,
    IPC
});

// seems like some plugin
