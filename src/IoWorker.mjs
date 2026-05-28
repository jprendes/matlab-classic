class IoWorker {
    #sab = new SharedArrayBuffer(128 + Int32Array.BYTES_PER_ELEMENT);
    #ctrl = new Int32Array(this.#sab, 0, 1)
    #data = new Uint8Array(this.#sab, Int32Array.BYTES_PER_ELEMENT);

    #decoder = new TextDecoder();

    #channel;

    constructor(channel = globalThis) {
        this.#channel = channel;
        Atomics.store(this.#ctrl, 0, -1);
    }

    stdout = (msg) => {
        this.#channel.postMessage(['stdout', msg]);
    }

    stderr = (msg) => {
        this.#channel.postMessage(['stderr', msg]);
    }

    stdin = () => {
        Atomics.store(this.#ctrl, 0, -1);
        this.#channel.postMessage(['stdin', this.#sab]);
        Atomics.wait(this.#ctrl, 0, -1);
        const bytes = this.#data.slice(0, Atomics.load(this.#ctrl, 0));
        return this.#decoder.decode(bytes, { stream: true });
    }

    ready() {
        this.#channel.postMessage(['ready']);
    }

    exit(code) {
        this.#channel.postMessage(['exit', code]);
    }
};

export default IoWorker;
