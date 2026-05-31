import { Terminal } from "xterm";
import { Readline } from "xterm-readline";
import "xterm/css/xterm.css";

import IoClient from "./IoClient.mjs";
import FitFontSize from "./FitFontSize.mjs";

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
            cols: 80,
            rows: 24,
        });

        const rl = new Readline();
        term.loadAddon(rl);

        term.open(element);

        const fitter = new FitFontSize(term, element, {
            maxFontSize: 15,
            minFontSize: 5,
            onChange(newSize) {
                document.body.classList.toggle('compact', newSize < 15);
            },
        });

        term.focus();
        window.addEventListener('focus', () => term.focus());

        const client = new Client();

        let shiftEnter = false;

        term.attachCustomKeyEventHandler((ev) => {
            if (ev.type === 'keydown' && ev.key === 'Enter' && ev.shiftKey) {
                shiftEnter = true;
            }
            if (ev.type === 'keydown' && ev.ctrlKey && ev.key === 'd' && rl.getLine() === '') {
                client.stdin("");
            }
            return true;
        });
        rl.setCheckHandler(() => {
            if (shiftEnter) {
                shiftEnter = false;
                return false;
            }
            if (rl.getLine().split("\n").pop().includes("...")) {
                return false;
            }
            return true;
        });

        let line = "";
        client.addEventListener("stdout", (evt) => {
            // do not print the prompt "<>" emitted by the patched MATLAB
            // when it needs more input, xterm-readline already prints its
            // own prompt in that case
            const data = evt.detail.data;
            line += data;
            line = line.match(/[^\n]*\n?$/)[0];
            if (line === "<>\n") {
                return;
            }
            rl.write(data);
        });
        client.addEventListener("stderr", (evt) => rl.write(evt.detail.data));
        client.addEventListener("stdin", async () => {
            let input = "";
            if (line == "<>\n") {
                term.write("\x1b[A");
                input = await rl.read("\n<>");
            } else {
                input = await rl.read("");
            }
            client.stdin(input + "\n");
        });
        client.addEventListener("ready", () => {
            term.options.disableStdin = false;
            term.options.cursorBlink = true;
            term.element.style.opacity = 1;
        });
        client.addEventListener("exit", () => {
            term.options.disableStdin = true;
            term.options.cursorBlink = false;
            term.element.style.opacity = 0.5;

            const btn = document.createElement("button");
            btn.className = "restart-btn";
            btn.textContent = "↻ Restart";
            btn.addEventListener("click", () => {
                btn.remove();
                fitter.dispose();
                term.dispose();
                Client.fromElement(element);
            });
            element.appendChild(btn);
        });

        client.terminal = term;

        return client;
    }
};

export default Client;
