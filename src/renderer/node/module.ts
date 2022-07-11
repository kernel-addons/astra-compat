import IPCEvents from "../../common/ipcevents";
import DataStore from "../modules/datastore";
import {AstraPatcher} from "../modules/patcher";

const {path, FileUtils, IPC} = AstraNative;

export const cache = {};
export const nodeGlobals = ["require", "module", "exports", "__filename", "__dirname", "global"].join(", ");
export const globalPaths = [path.resolve(DataStore.root, "node_modules")];


const wrapModule = (code: string, filename: string) => {
    return new Function(nodeGlobals, `${code}\n\n//# sourceURL=${JSON.stringify(filename).slice(1, -1)}`);
};

export const extensions = {
    ".js": (module: Module, filename: string) => {
        const fileContent = FileUtils.readFile(filename, "utf8");
        module._compile(fileContent);
        return module.exports;
    },
    ".json": (module: Module, filename: string) => {
        const filecontent = FileUtils.readFile(filename, "utf8");
        module.exports = JSON.parse(filecontent);

        return module.exports;
    },
    ...[".jsx", ".tsx", ".ts"].reduce((obj, item) => Object.assign(obj, {
        [item]: (module: Module, filename: string) => {
            const code = IPC.sendSync(IPCEvents.ES_BUILD, filename, {
                target: "esnext",
                jsx: "transform",
                format: "cjs"
            });
    
            module._compile(code, filename);
    
            return module.exports;
        }
    }), {}),
    ".scss": (module: Module, filename: string) => {
        const content = IPC.sendSync(IPCEvents.COMPILE_SASS, filename);
        module.exports = content;

        return content;
    },
    ".css": (module: Module, filename: string) => {
        const content = FileUtils.readFile(filename, "utf8");
        module.exports = content;

        return module.exports;
    },
    // I haven't tested this - I assume it works.
    // TODO: Make this not shitty
    // ".node": (module: Module, filename: string) => {
    //     module.exports = NativeModule.loadLibrary(filename);

    //     return module.exports;
    // }
};

export class Module {
    public id: string;
    public path: string;
    public exports: any;
    public parent: Module | null;
    public filename: string;
    public loaded: boolean;
    public children: Module[];
    public require: any;
    public filecontent?: string;

    constructor(id: string, parent: Module) {
        this.id = id;
        this.path = path.dirname(id);
        this.exports = {};
        this.parent = parent;
        this.filename = id;
        this.loaded = false;
        this.children = [];

        if (parent) parent.children.push(this);
    }

    destroy() {
        this.require = null;
        this.exports = null;
        delete cache[this.filename];

        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index > -1) this.parent.children.splice(index, 1);
            this.parent = null;
        }


        for (const child of this.children) {
            child.destroy();
        }
    }

    _compile(code: string, filename?: string) {
        const wrapped = wrapModule(code, this.filename);
        wrapped(this.require, this, this.exports, this.filename, this.path, window);
    }
};

export function resolve(path: string) {
    for (const key in cache) {
        if (key.startsWith(path)) return key;
    }
};

export type Require = CallableFunction & {
    resolve(path: string): string;
    cache: object;
};

export function createRequire(_path: string, parent: Module): Require {
    const require = (mod: string) => {
        if (typeof (mod) !== "string") return;

        switch (mod) {
            case "@patcher": return AstraPatcher;
            case "@classes": 

            default: {
                // if (mod.indexOf("@astra1

                return load(_path, mod, parent as any);
            }
        }
    };

    Object.assign(require, {cache, resolve});

    // @ts-ignore
    return require;
};

function hasExtension(mod: string) {
    return Boolean(extensions[path.extname(mod)]);
};

export function getExtension(mod: string) {
    return path.extname(mod) || Object.keys(extensions).find(ext => fs.existsSync(mod + ext)) || "";
};

function collectPNPMStores(node_modules: string) {
    const store = path.join(node_modules, ".pnpm");
    if (!fs.existsSync(store) || !fs.statSync(store).isDirectory()) return [];

    const result = [];

    for (const file of fs.readdirSync(store, "utf8")) {
        const fullPath = path.join(store, file, "node_modules");

        if (fs.existsSync(fullPath)) result.push(fullPath);
    }

    return result;
}

function resolveGlobalPath(mod: string, globalPaths: string[]) {
    const directMatch = globalPaths.find(globalPath => fs.existsSync(path.join(globalPath, mod)));
    if (directMatch) return directMatch;

    const withExtension = globalPaths.find(globalPath => getExtension(path.join(globalPath, mod)));
    if (withExtension) return withExtension;

    return "";
}

function getGlobalPath(mod: string) {
    const fromGlobals = resolveGlobalPath(mod, globalPaths);
    if (fromGlobals) return fromGlobals;

    const allPaths = globalPaths.flatMap(globalPath => collectPNPMStores(globalPath));
    const fromPNPM = resolveGlobalPath(mod, allPaths);
    if (fromPNPM) return fromPNPM;

    return "";
}

function getParent(_path: string, mod: string) {
    const concatPath = path.resolve(_path, mod);
    if (fs.existsSync(concatPath)) return concatPath;

    const globalPath = path.join(getGlobalPath(mod), mod);
    if (fs.existsSync(globalPath)) return globalPath;

    return "";
}

export function resolveMain(_path: string, mod: string): string {
    const parent = hasExtension(_path) ? path.dirname(_path) : getParent(_path, mod);

    if (!fs.existsSync(parent)) throw new Error(`Cannot find module ${mod}\ntree:\n\r-${_path}`);
    const files = fs.readdirSync(parent, "utf8");

    for (const file of files) {
        const ext = path.extname(file);

        if (file === "package.json") {
            const pkg = JSON.parse(fs.readFileSync(path.resolve(parent, file), "utf8"));
            if (!Reflect.has(pkg, "main")) continue;

            return path.resolve(parent, hasExtension(pkg.main) ? pkg.main : pkg.main + getExtension(path.join(parent, pkg.main)));
        }

        if (file.slice(0, -ext.length) === "index" && extensions[ext]) return path.resolve(parent, file);
    }

    if (mod.startsWith("./")) return null;
    const globalMod = globalPaths.find(pth => fs.existsSync(path.join(pth, mod)));

    if (globalMod) return resolveMain(globalMod, mod);

    return globalPaths.find(pth => getExtension(path.join(pth, mod)));
};

export function getFilePath(_path: string, mod: string): string {
    const combined = path.resolve(_path, mod);
    const pth = hasExtension(combined) ? combined : combined + getExtension(combined);

    if (fs.existsSync(pth) && fs.statSync(pth).isFile()) return pth;
    if (!hasExtension(mod)) return resolveMain(_path, mod);

    return mod;
};

export function load(_path: string, mod: string, req = null) {
    const file = getFilePath(_path, mod);
    if (!fs.existsSync(file)) throw new Error(`Cannot find module ${mod}\ntree:\n\r-${_path}`);
    if (cache[file]) return cache[file].exports;
    // const stats = fs.statSync(file);
    // if (stats.isDirectory()) mod = resolveMain(_path, mod);
    const ext = getExtension(file);
    const loader = extensions[ext];

    if (!loader) throw new Error(`Cannot find module ${mod}`);
    const module = cache[file] = new Module(file, req);
    const require = createRequire(path.dirname(file), module);
    module.require = require;

    loader(module, file);

    return module.exports;
};

// TODO: Add globalPaths support
const NodeModule = {_extensions: extensions, cache, _load: load, globalPaths: globalPaths};

if (window.process && !window.process.contextIsolated) {
    const Module = window.require("module");
    const oldLoad = Module._load;

    Module._load = function (mod: string) {
        if (mod === "powercord") {
            return powercord;
        }
        else if (~mod.indexOf("pc-settings/components/ErrorBoundary")) {
            return errorboundary;
        }
        else if (mod.startsWith("powercord/")) {
            const value = mod.split("/").slice(1).filter(Boolean).reduce((value, key) => value[key], powercord);
            if (value) return value;
        }

        return Reflect.apply(oldLoad, this, arguments);
    }

    const _extensions = [".jsx"];
    for (const ext of _extensions) {
        Module._extensions[ext] = extensions[ext];
    }

    Module.globalPaths.push(path.resolve(PCCompatNative.getBasePath(), "node_modules"));
}

export default !window.process || process.contextIsolated ? NodeModule : window.require("module");
