import chalk from "chalk";
import * as Discord from "discord.js";
import { Room } from "node-ncc-es6";
import * as readline from "readline";
import Runtime from "./discord/runtime";
import Log from "./log";
import Ncc from "./ncc/ncc";
import NcChannel from "./ncc/talk/ncchannel";
import Cafe from "./structure/cafe";

let run:Runtime;
async function start() {
    run = new Runtime();
    run.on("restart",async () => {
        run.removeAllListeners("restart");
        await run.destroy();
        Log.d("Main", "Restarting Runtime...");
        setTimeout(start, 2000);
    });
    await run.start();
}
Log.hook();
// start();
init();


async function init() {
    /*
    run = new Runtime();
    await run.start();
    */
    const ncc = new Ncc();
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole());
    if (loaded != null) {
        Log.d(`name: ${loaded}`);
        // const ar = await ncc.getArticleDetail(26686242, 7382);
        if (ncc.available) {
            await ncc.fetchChannels();
            await ncc.testChannel(106977317649);
        }
    }
}
// init();