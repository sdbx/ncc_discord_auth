import { Room } from "node-ncc-es6";
import Runtime from "./discord/runtime";
import NcFetch from "./ncc/ncfetch";
import Cafe from "./structure/cafe";
async function init() {
    // const run:Runtime = new Runtime();
    // await run.start();
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
   // await Fetcher.getMember(26686242,"끼로");
    const ncc = new NcFetch();
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole());
    let html;
    if (loaded != null) {
        console.log("name: " + loaded);
        const ar = await ncc.getArticleDetail(26686242, 7382);
        const ac = await ncc.getMember(26686242, "끼로",true);
        html = "";
    }
    console.log(html);
   /*
    const cafe:Cafe = await Fetcher.parseNaver("https://cafe.naver.com/sdbx/7433");
    const ncc:Ncc = new Ncc();
    const session = await ncc.login();
    const room:Room = await session.createRoom(cafe,[{id:"naverid"}]);
    console.log(`https://talk.cafe.naver.com/channels/${room.id}`);
    await session.sendText(room,"반가워");
    await session.deleteRoom(room);
    console.log("Hello World");
    */
}
init();