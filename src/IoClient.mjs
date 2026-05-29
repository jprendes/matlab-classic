class IoClient extends EventTarget {
    #deferred = Promise.withResolvers();
    #encoder = new TextEncoder();
    #chunks = [];
    #totalBytes = 0;

    stdin = (data) => {
        if (typeof data === "string") {
            data = this.#encoder.encode(data);
        }
        this.#chunks.push(new Uint8Array(data));
        this.#totalBytes += data.byteLength;
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
        if (this.#totalBytes === 0) {
            this.dispatchEvent(new CustomEvent("stdin"));
        }
        await this.#deferred.promise;
        const ctrl = new Int32Array(sab, 0, 1)
        const data = new Uint8Array(sab, ctrl.byteOffset + ctrl.byteLength);
        const size = Math.min(this.#totalBytes, data.byteLength);
        let offset = 0;
        while (offset < size && this.#chunks.length > 0) {
            const chunk = this.#chunks[0];
            const needed = size - offset;
            if (chunk.byteLength <= needed) {
                data.set(chunk, offset);
                offset += chunk.byteLength;
                this.#chunks.shift();
            } else {
                data.set(chunk.subarray(0, needed), offset);
                this.#chunks[0] = chunk.subarray(needed);
                offset += needed;
            }
        }
        this.#totalBytes -= size;
        if (this.#totalBytes === 0) {
            this.#deferred = Promise.withResolvers();
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
