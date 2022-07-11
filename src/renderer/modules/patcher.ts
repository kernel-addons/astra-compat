// TODO: Handle instead patches

type AfterCallback<Args extends IArguments, Result> = (thisObject: any, args: Args, result: Result) => any;

type BeforeCallback<Args extends IArguments> = (args: Args) => any;

export type PatchData<Args extends IArguments, Result> = {
    [method: string]: {
        after?: AfterCallback<Args, Result>,
        before?: BeforeCallback<Args>
    }
};

type Patch<Args extends IArguments, Result, Type extends "before" | "after" | "instead"> = {
    type: Type,
    callback: AfterCallback<Args, Result> | BeforeCallback<Args>,
    errors: number,
    caller: string,
    revert(): void;
};

type PatchItem<Args extends IArguments = any, Result = any> = {
    originalFunction: Function,
    proxy: ProxyHandler<Function>,
    before: Array<Patch<Args, Result, "before">>,
    after: Array<Patch<Args, Result, "after">>,
};

const cache = new WeakMap<Function, PatchItem>();
const patcherSymbol = Symbol("PATCHER_ORIGINAL");

class Patcher {
    caller: string;
    ERROR_LIMIT: number;
    unpatches: Array<Function> = [];

    constructor({caller, errorLimit: errorLimit = 2}: {caller: string, errorLimit?: number}) {
        this.caller = caller;
        this.ERROR_LIMIT = errorLimit;
    }

    unpatchAll() {
        for (const unpatch of this.unpatches) unpatch();
    }

    getTypeInfo(thing: any) {
        if (Array.isArray(thing)) return "Array";
        if (thing === null) return "null";
        
        return typeof thing;
    }

    patch<Args extends IArguments, Result = any>(module: any, patchData: PatchData<Args, Result>): () => void {
        const defer: Array<Function> = [];

        for (const method in patchData) {
            if (typeof patchData[method] !== "object" || Array.isArray(patchData[method]) || patchData[method] === null) {
                throw new TypeError(`Patch data must be an object! Received ${this.getTypeInfo(patchData[method])} instead.`);
            }

            const patch = this.#createPatch(module[method]);
            
            for (const type in patchData[method]) {
                if (type !== "after" && (type as string) !== "before") throw new TypeError(`Unknown patch type: ${type}`);

                const handleDefer = () => {
                    {
                        const index = patch[type].indexOf(child);
                        if (index > -1) patch[type].splice(index, 1);
                    }

                    {
                        const index = this.unpatches.indexOf(handleDefer);
                        if (index > -1) this.unpatches.splice(index, 1);
                    }
                };

                const child = {
                    callback: patchData[method][type] as any,
                    caller: this.caller,
                    errors: 0,
                    type: type as "after",
                    revert: handleDefer
                };

                patch[type].push(child);
                defer.push(handleDefer);
                this.unpatches.push(handleDefer);

                module[method] = patch.proxy;
            }
        }

        return () => {
            for (const unpatch of defer) unpatch();
        }
    }

    #createPatch<Args extends IArguments, Result>(func: Function): PatchItem<Args, Result> {
        if (cache.has(func[patcherSymbol] ?? func)) return cache.get(func[patcherSymbol] ?? func) as PatchItem<Args, Result>;

        const data: PatchItem<Args, Result> = {
            after: [],
            before: [],
            originalFunction: func,
            proxy: new Proxy(func, {
                get(target, key) {
                    switch (key) {
                        case patcherSymbol: return func;
                        case "toString": return func.toString.bind(func);

                        default: return target[key];
                    }
                },
                set(target, key, value) {
                    target[key] = value;

                    return true;
                },
                apply: (originalFunction, that, args) => {
                    let newArgs = args;

                    for (const before of data.before) {
                        try {
                            const tempArgs = before.callback.call(that, that, newArgs);
                            if (Array.isArray(tempArgs)) {
                                newArgs = tempArgs;
                            }
                        } catch (error) {
                            console.error(`[Patcher][${before.caller}] Error in before patch occurred:`, error);

                            if (before.errors >= this.ERROR_LIMIT) {
                                before.revert();
                                console.error(`[Patcher][${before.caller}] Unpatched due to error limit reached.`);
                            }
                            before.errors++;
                        }
                    }

                    let result: Result = (() => {
                        try {
                            return originalFunction.apply(that, newArgs);
                        } catch (error) {
                            console.error(`[Patcher] Failed to run original function with modified args.`, error);

                            return originalFunction.apply(that, args);
                        }
                    })();

                    for (const after of data.after) {
                        try {
                            const tempResult = after.callback.call(that, that, args, result);
                            if (tempResult !== undefined) {
                                result = tempResult;
                            }
                        } catch (error) {
                            console.error(`[Patcher][${after.caller}] Error in before patch occurred:`, error);

                            if (after.errors >= this.ERROR_LIMIT) {
                                after.revert();
                                console.error(`[Patcher][${after.caller}] Unpatched due to error limit reached.`);
                            }
                            after.errors++;
                        }
                    }

                    return result;
                }
            })
        };

        cache.set(func, data);

        return data;
    }

    after<Args extends IArguments, Result = any>(module: any, method: string, callback: AfterCallback<Args, Result>): () => void {
        return this.patch(module, {
            [method]: {after: callback}
        });
    }

    before<Args extends IArguments>(module: any, method: string, callback: BeforeCallback<Args>): () => void {
        return this.patch(module, {
            [method]: {before: callback}
        });
    }
}

const _patchers = new Map<string, Patcher>();
export const AstraPatcher = {
    _patchers,
    ...["after", "before"].reduce((obj, type) => Object.assign(obj, {
        [type](caller: string, module: any, method: string, callback: any) {
            if (_patchers.has(caller)) return _patchers.get(caller)![type](module, method, callback);
    
            const patcher = new Patcher({caller});
            _patchers.set(caller, patcher);
    
            return patcher[type](module, method, callback);
        }
    }), {}),
    instead(caller: string, module: any, method: string, callback: any) {
        const original = module[method] ?? function () {};
        const unpatch = () => void (module[method] = original);

        module[method] = function () {
            try {
                return callback.call(this, this, arguments, original);
            } catch (error) {
                console.error(`Could not fire instead patch for ${caller}:`, error);
            }
        };

        if (!_patchers.has(caller)) {
            _patchers.set(caller, new Patcher({caller}));
        }

        _patchers.get(caller)!.unpatches.push(unpatch);

        return unpatch;
    },
    unpatchAll(caller: string) {
        if (!_patchers.has(caller)) return;

        const patcher = _patchers.get(caller);
        patcher?.unpatchAll();

        _patchers.delete(caller);
    }
};

export default Patcher;
