/// <reference path="./types/electron.d.ts" />

declare const AstraNative: {
    path: typeof import("path"),
    __dirname: string;
    environment: "development" | "production";
    FileUtils: {
        exists(path: string): boolean;
        mkdir(path: string): void;
        readFile<T extends "utf8" | "binary">(path: string, encoding?: T): T extends "utf8" ? string : Uint8Array;
    };
    IPC: {
        sendSync(cmd: string, ...args: any[]): any;
        invoke(cmd: string, ...argS: any[]): Promise<any>;
    }   
};
