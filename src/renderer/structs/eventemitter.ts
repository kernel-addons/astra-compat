export default class EventEmitter extends EventTarget {
    public off(event: string, listener: (...args: any[]) => void): EventEmitter {
        super.removeEventListener(event, listener);
        return this;
    }

    public on(event: string, listener: (...args: any[]) => void, options?: AddEventListenerOptions): EventEmitter {
        super.addEventListener(event, listener, options);
        return this;
    }

    public once(event: string, listener: (...args: any[]) => void, options?: Omit<AddEventListenerOptions, "once">): EventEmitter {
        this.on(event, listener, {
            ...options,
            once: true
        });

        return this;
    }

    public emit({event, ...rest}): EventEmitter {
        this.dispatchEvent(new Event(event, rest));
        return this;
    }

    public get dispatch(): typeof this.emit {return this.emit.bind(this);}
}
