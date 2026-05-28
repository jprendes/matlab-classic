const concat = (a, b) => {
    const c = new Uint8Array(a.byteLength + b.byteLength);
    c.set(a);
    c.set(b, a.byteLength);
    return c;
}

class Deferred {
    constructor() {
        const promise = new Promise((resolve, reject) =>  {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.then = promise.then.bind(promise);
    }
};

class IoClient extends EventTarget {
    #deferred = new Deferred();
    #encoder = new TextEncoder();
    #decoderout = new TextDecoder("utf-8");
    #decodererr = new TextDecoder("utf-8");
    #buffer = new Uint8Array(0);

    stdin = (data) => {
        if (typeof data === "string") {
            data = this.#encoder.encode(data);
        }
        this.#buffer = concat(this.#buffer, new Uint8Array(data));
        this.#deferred.resolve();
    }

    constructor(channel) {
        super();
        channel.addEventListener("message", ({data}) => {
            const [type, ...args] = data;
            switch (type) {
                case "stdin": return this.#stdin(...args);
                case "stdout": return this.#stdout(...args);
                case "stderr": return this.#stderr(...args);
                case "ready": return this.#ready(...args);
                case "exit": return this.#exit(...args);
            }
        });
    }

    #stdin = async (sab) => {
        await this.#deferred;
        const ctrl = new Int32Array(sab, 0, 1)
        const data = new Uint8Array(sab, ctrl.byteOffset + ctrl.byteLength);
        const size = Math.min(this.#buffer.byteLength, data.byteLength);
        data.set(this.#buffer.subarray(0, data.byteLength));
        this.#buffer = this.#buffer.subarray(data.byteLength);
        if (this.#buffer.byteLength === 0) {
            this.#deferred = new Deferred();
        }
        Atomics.store(ctrl, 0, size);
        Atomics.notify(ctrl, 0);
    }

    #stdout = (data) => {
        this.dispatchEvent(new CustomEvent("stdout", { detail: { data } }));
    }

    #stderr = (data) => {
        this.dispatchEvent(new CustomEvent("stderr", { detail: { data } }));
    }

    #ready = () => {
        this.dispatchEvent(new CustomEvent("ready"));
    }

    #exit = (code, message) => {
        this.dispatchEvent(new CustomEvent("exit", { detail: { code, message } }));
    }
};

export default IoClient;
