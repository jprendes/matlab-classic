import { createServer, STATUS_CODES } from "http";
import { normalize, resolve, join } from "path";
import { stat } from "fs/promises";
import { createReadStream } from "fs";

const ROOT = normalize(resolve(process.argv[2] || process.env.ROOT || process.cwd()));
const PORT = parseInt(process.argv[3] || process.env.PORT || "8080");
const INDEX = process.env.INDEX || "index.html";

function mime(path) {
    const types = {
        "js": "application/javascript",
        "mjs": "application/javascript",
        "css": "text/css",
        "html": "text/html",
        "wasm": "application/wasm",
        "map": "application/json",
        "json": "application/json",
    }
    return types[path.split(".").slice(-1)[0]] || "application/octet-stream";
}

async function safe_stat(path) {
    try {
        return await stat(path);
    } catch (e) {
        return null;
    }
}

async function is_dir(path) {
    const stat = await safe_stat(path);
    return stat?.isDirectory();
}

async function is_file(path) {
    const stat = await safe_stat(path);
    return stat?.isFile();
}

function error_with_code(res, code) {
    res.writeHead(code, STATUS_CODES[code], {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
    });
    res.end(STATUS_CODES[code]);
}

process.on('SIGINT', function() {
    console.log( "\nShutting down" );
    process.exit(0);
});

createServer(async (req, res) => {
    const { url } = req;
    let path = normalize(join(ROOT, url));

    if (!path.startsWith(ROOT)) return error_with_code(res, 404);

    if (await is_dir(path)) {
        path = normalize(join(ROOT, url, INDEX));
    }

    if (!await is_file(path)) return error_with_code(res, 404);

    const headers = {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Content-Type": mime(path),
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
    };

    res.writeHead(200, headers);
    createReadStream(path).pipe(res);
}).listen(PORT);

console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
