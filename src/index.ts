import chalk from "chalk";
import * as Discord from "discord.js";
import { Room } from "node-ncc-es6";
import * as readline from "readline";
import Runtime from "./discord/runtime";
import * as Log from "./log";
import Ncc from "./ncc/ncc";
import Cafe from "./structure/cafe";
async function init() {
    await Log.hook();
    const run:Runtime = new Runtime();
    await run.start();
    /*
    const cfg = new Bot();
    await cfg.import(true).catch((err) => null);
    const client = new Discord.Client();
    client.on("ready", async () => {console.log(`Ready on ${client.user.tag}`)});
    client.on("message",(msg) => {
        console.log(msg.content);
    });
    client.login(cfg.token);
    */
    console.log("Test");
    await Log.read("Test",true,false);
   // await Fetcher.getMember(26686242,"끼로");
    return;
    const ncc = new Ncc();
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole());
    if (loaded != null) {
        Log.d(`name: ${loaded}`);
        const ar = await ncc.getArticleDetail(26686242, 7382);
        const ac = await ncc.getMember(26686242, "벨붕",true);
        if (ncc.available) {
            const room:Room = await ncc.chat.createRoom({id: ac[0].cafeId}, [{ id: ac[0].userid }]);
            Log.d(`https://talk.cafe.naver.com/channels/${room.id}`);
            await ncc.chat.sendText(room, "반가워");
            await ncc.chat.deleteRoom(room);
            Log.d("Hello World");
        }
    }
}
init();