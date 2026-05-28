class ExitStatus {
  constructor(code) { this.code = code; }
}

export default class MATLAB {
  #instance;
  #memory;
  #HEAPU8;
  #HEAPU32;
  #HEAP64;
  #encoder = new TextEncoder();
  #decoder = new TextDecoder();

  #stdin;
  #stdout;
  #stderr;
  #system;
  #randomFill;
  #args;
  #wasmUrl;

  // stdin buffering: convert strings into bytes
  #stdinBuf = [];
  #stdinEof = false;
  #stdinNeedFlush = false;

  constructor({
    wasmBinary,
    wasmUrl = new URL("./classic.wasm", import.meta.url),
    args = [],
    stdin = () => null,
    stdout = (str) => {},
    stderr = (str) => {},
    system = (cmd) => { throw new Error(`system() not available: ${cmd}`); },
    randomFill = (buf) => crypto.getRandomValues(buf),
  } = {}) {
    this.wasmBinary = wasmBinary;
    this.#wasmUrl = wasmUrl;
    this.#args = ["matlab", ...args];
    this.#stdin = stdin;
    this.#stdout = stdout;
    this.#stderr = stderr;
    this.#system = system;
    this.#randomFill = randomFill;
  }

  #readByte() {
    if (this.#stdinBuf.length > 0) return this.#stdinBuf.shift();
    if (this.#stdinEof) return null;
    if (this.#stdinNeedFlush) {
      this.#stdinNeedFlush = false;
      return null;
    }
    const str = this.#stdin();
    if (str === null) {
      this.#stdinEof = true;
      return null;
    }
    const bytes = this.#encoder.encode(str, { stream: true });
    for (let i = 0; i < bytes.length; i++) this.#stdinBuf.push(bytes[i]);
    this.#stdinNeedFlush = true;
    if (this.#stdinBuf.length === 0) return null;
    return this.#stdinBuf.shift();
  }

  #updateViews() {
    const buf = this.#memory.buffer;
    this.#HEAPU8 = new Uint8Array(buf);
    this.#HEAPU32 = new Uint32Array(buf);
    this.#HEAP64 = new BigInt64Array(buf);
  }

  #getWasiImports() {
    return {
      args_get: (argv, argv_buf) => {
        this.#updateViews();
        let offset = 0;
        for (let i = 0; i < this.#args.length; i++) {
          this.#HEAPU32[(argv + i * 4) >> 2] = argv_buf + offset;
          const bytes = this.#encoder.encode(this.#args[i]);
          this.#HEAPU8.set(bytes, argv_buf + offset);
          this.#HEAPU8[argv_buf + offset + bytes.length] = 0;
          offset += bytes.length + 1;
        }
        return 0;
      },

      args_sizes_get: (pargc, pargv_buf_size) => {
        this.#updateViews();
        this.#HEAPU32[pargc >> 2] = this.#args.length;
        let size = 0;
        for (const arg of this.#args) size += this.#encoder.encode(arg).length + 1;
        this.#HEAPU32[pargv_buf_size >> 2] = size;
        return 0;
      },

      clock_time_get: (clk_id, _precision, ptime) => {
        this.#updateViews();
        if (clk_id < 0 || clk_id > 3) return 28;
        const now = clk_id === 0 ? Date.now() : performance.now();
        this.#HEAP64[ptime >> 3] = BigInt(Math.round(now * 1e6));
        return 0;
      },

      fd_read: (fd, iov, iovcnt, pnum) => {
        this.#updateViews();
        if (fd !== 0) return 8; // EBADF
        try {
          let totalRead = 0;
          for (let i = 0; i < iovcnt; i++) {
            const ptr = this.#HEAPU32[(iov + i * 8) >> 2];
            const len = this.#HEAPU32[(iov + i * 8 + 4) >> 2];
            for (let j = 0; j < len; j++) {
              const byte = this.#readByte();
              if (byte === null) {
                this.#HEAPU32[pnum >> 2] = totalRead;
                return 0;
              }
              this.#HEAPU8[ptr + j] = byte;
              totalRead++;
            }
          }
          this.#HEAPU32[pnum >> 2] = totalRead;
          return 0;
        } catch (err) {
          console.error("fd_read error:", err);
          return 29; // EIO
        }
      },

      fd_write: (fd, iov, iovcnt, pnum) => {
        this.#updateViews();
        const write = fd === 2 ? this.#stderr : this.#stdout;
        try {
          let totalWritten = 0;
          for (let i = 0; i < iovcnt; i++) {
            const ptr = this.#HEAPU32[(iov + i * 8) >> 2];
            const len = this.#HEAPU32[(iov + i * 8 + 4) >> 2];
            write(this.#decoder.decode(this.#HEAPU8.subarray(ptr, ptr + len), { stream: true }));
            totalWritten += len;
          }
          this.#HEAPU32[pnum >> 2] = totalWritten;
          return 0;
        } catch { return 29; } // EIO
      },

      proc_exit: (code) => {
        throw new ExitStatus(code);
      },

      random_get: (buffer, size) => {
        this.#updateViews();
        try {
          this.#randomFill(this.#HEAPU8.subarray(buffer, buffer + size));
          return 0;
        } catch { return 29; } // EIO
      },
    };
  }

  #getEnvImports() {
    return {
      _emscripten_system: (ptr) => {
        this.#updateViews();
        let end = ptr;
        while (this.#HEAPU8[end]) end++;
        const cmd = this.#decoder.decode(this.#HEAPU8.subarray(ptr, end));
        try { return this.#system(cmd); } catch { return -1; }
      },
    };
  }

  async #loadBinary(url) {
    if (typeof process !== "undefined" && process.versions?.node) {
      const { readFile } = await import("node:fs/promises");
      return readFile(new URL(url));
    }
    return fetch(url).then(r => r.arrayBuffer());
  }

  async ready() {
    const binary = this.wasmBinary ?? await this.#loadBinary(this.#wasmUrl);

    const { instance } = await WebAssembly.instantiate(binary, {
      wasi_snapshot_preview1: this.#getWasiImports(),
      env: this.#getEnvImports(),
    });
    this.#instance = instance;

    this.#memory = this.#instance.exports.memory;
    this.#updateViews();

    this.ready = async () => {};
  }

  async run() {
    await this.ready();

    this.#updateViews();

    try {
      this.#instance.exports._start();
    } catch (e) {
      if (e instanceof ExitStatus) return e.code;
      throw e;
    }
    return 0;
  }
}
