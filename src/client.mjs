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
            allowProposedApi: true,
        });
        term.open(element);

        const { master, slave } = openpty();
        term.loadAddon(master);

        const addon = new WebglAddon.WebglAddon();
        addon.onContextLoss(e => addon.dispose());
        term.loadAddon(addon);

        const client = new Client();

        slave.onReadable(() => client.stdin(slave.read()));

        client.addEventListener("stdout", (evt) => slave.write(evt.detail.data));
        client.addEventListener("stderr", (evt) => slave.write(evt.detail.data));
        client.addEventListener("ready", () => {
            term.options.disableStdin = false;
            term.element.style.opacity = 1;
        });
        client.addEventListener("exit", () => {
            term.options.disableStdin = true;
            term.element.style.opacity = 0.5;
        });

        client.terminal = term;

        return client;
    }
};

export default Client;
