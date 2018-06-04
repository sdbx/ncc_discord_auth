import Runtime from "./discord/runtime";
async function init() {
    const run:Runtime = new Runtime();
    run.start();
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
}
init();