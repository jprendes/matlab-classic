import MATLAB from "./matlab.mjs";
import IoWorker from "./IoWorker.mjs";

async function main() {
    const io = new IoWorker(globalThis);
    const matlab = new MATLAB({
        ...io
    });

    try {
        await matlab.ready();
        io.ready();
        const ret = await matlab.run();
        io.exit(ret);
    } catch (err) {
        io.exit(1, err?.message);
    }
}

main();