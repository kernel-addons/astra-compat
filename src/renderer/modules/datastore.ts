import EventEmitter from "../structs/eventemitter";

const {path, __dirname, environment, FileUtils} = AstraNative;

const DataStore = new class DataStore extends EventEmitter {
    public root = path.resolve(
        __dirname,
        // Go inside packages folder
        environment === "development" ? "../.." : "..",
        ".."
    );

    public folder = path.resolve(this.root, "Astra");
    public storage = path.resolve(this.folder, "storage");
    public plugins = path.resolve(this.folder, "plugins");
    public themes = path.resolve(this.folder, "themes");

    constructor() {
        super();

        this.ensureFolders();
    }

    private ensureFolders(): void {
        const list = new Set([this.folder, this.storage, this.plugins, this.themes]);

        for (const item of list) {
            if (FileUtils.exists(item)) continue;

            try {
                FileUtils.mkdir(item);
            } catch (error) {
                console.error(`Failed to create folder at ${item}:`, error);
                break;
            }
        }
    }
}

export default DataStore;
