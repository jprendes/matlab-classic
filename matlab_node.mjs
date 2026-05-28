import { readSync } from "node:fs";

import MATLAB from "./build/matlab.mjs";

const buf = Buffer.alloc(4096);

function stdin() {
    const n = readSync(0, buf);
    if (n === 0) return null;
    return buf.toString("utf8", 0, n);
}

function stdout(str) {
    process.stdout.write(str);
}

function stderr(str) {
    process.stderr.write(str);
}

let matlab = new MATLAB({
    stdin,
    stdout,
    stderr,
});

let ec = await matlab.run();

process.exit(ec);
