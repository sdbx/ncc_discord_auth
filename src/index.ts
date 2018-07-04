import { Room } from "node-ncc-es6";
import Runtime from "./discord/runtime";
import Fetcher from "./fetcher";
import Ncc from "./ncc/ncc";
import Cafe from "./structure/cafe";
async function init() {
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
    const cafe:Cafe = await Fetcher.parseNaver("https://cafe.naver.com/sdbx/7433");
    const ncc:Ncc = new Ncc();
    const session = await ncc.login();
    const room:Room = await session.createRoom(cafe,[{id:"naverid"}]);
    /* session.sendText(message.room,
        values(message.room.users).map(user => user.nickname).join(', ')); */
    console.log(`https://talk.cafe.naver.com/channels/${room.id}`);
    await session.sendText(room,"반가워");
    await session.deleteRoom(room);
    console.log("Hello World");
}
init();