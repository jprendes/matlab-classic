export default function parseArgs(argv) {
    const args = { port: null, index: "index.html", https: false, root: null };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-p" || arg === "--port") { args.port = parseInt(argv[++i]); }
        else if (arg === "--index") { args.index = argv[++i]; }
        else if (arg === "--https") { args.https = true; }
        else if (arg.startsWith("-")) {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        } else if (args.root !== null) {
            console.error(`Unexpected argument: ${arg}`);
            process.exit(1);
        } else { args.root = arg; }
    }
    args.root ??= ".";
    args.port ??= args.https ? 8443 : 8080;
    return args;
}
