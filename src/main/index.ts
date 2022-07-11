import {transformSync} from "esbuild";
import {ipcMain} from "electron";
import IPCEvents from "../common/ipcevents";
import fs from "fs";
import path from "path";

const isDist = path.dirname(__dirname) === "dist";
const cache = path.resolve(__dirname, isDist ? "../.." : "..", "..", "Astra", "cache");

try {
    if (!fs.existsSync(cache)) {
        fs.mkdirSync(cache, {recursive: true});
    }
} catch {}

const createHash = (content: string): string => {
    let hash = 0;

    for (let i = 0; i < content.length;i++) {
        const char = content[i].charCodeAt(0);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return hash.toString();
}

const makeHeader = (content: string) => {
    return `/*ASTRA_FILE_HASH: ${createHash(content)}*/\n${content}`;
};

const readHeader = (content: string) => {
    return content.slice("/*ASTRA_FILE_HASH: ".length, content.indexOf("\n") - 2);
};
    
ipcMain.on(IPCEvents.ES_BUILD, (event, file, options) => {
    const cached = path.resolve(file);
    const content = fs.readFileSync(file, "utf8");

    const {code} = transformSync(content, options);

    event.returnValue = code;
});
