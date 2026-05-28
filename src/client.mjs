import { Terminal } from "xterm";
import { Readline } from "xterm-readline";
import { WebglAddon } from "xterm-addon-webgl";
import "xterm/css/xterm.css";

import IoClient from "./IoClient.mjs";

class Client extends IoClient {
    constructor() {
        const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: "module" });
        super(worker);
        this.worker = worker;
    }

    static fromElement(element) {
        const term = new Terminal({
            disableStdin: true,
            cursorBlink: false,
            allowProposedApi: true,
        });

        const rl = new Readline();
        term.loadAddon(rl);

        term.open(element);

        const addon = new WebglAddon();
        addon.onContextLoss(e => addon.dispose());
        term.loadAddon(addon);

        const client = new Client();

        let shiftEnter = false;

        term.attachCustomKeyEventHandler((ev) => {
            if (ev.type === 'keydown' && ev.key === 'Enter' && ev.shiftKey) {
                shiftEnter = true;
            }
            if (ev.type === 'keydown' && ev.ctrlKey && ev.key === 'd' && rl.getLine() === '') {
                client.stdin("");
            }
            if (ev.type === 'keydown' && ev.ctrlKey && ev.key === 'c') {
                client.stdin("\n");
            }
            return true;
        });

        rl.setCheckHandler(() => {
            if (shiftEnter) {
                shiftEnter = false;
                return false;
            }
            return true;
        });

        let running = false;

        async function readLoop() {
            running = true;
            while (running) {
                const line = await rl.read("");
                if (running) client.stdin(line + "\n");
            }
        }

        client.addEventListener("stdout", (evt) => rl.write(evt.detail.data));
        client.addEventListener("stderr", (evt) => rl.write(evt.detail.data));
        client.addEventListener("ready", () => {
            term.options.disableStdin = false;
            term.options.cursorBlink = true;
            term.element.style.opacity = 1;
            readLoop();
        });
        client.addEventListener("exit", () => {
            running = false;
            term.options.disableStdin = true;
            term.options.cursorBlink = false;
            term.element.style.opacity = 0.5;
        });

        client.terminal = term;

        return client;
    }
};

export default Client;
