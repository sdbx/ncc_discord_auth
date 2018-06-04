import * as Discord from "discord.js";
import Plugin from "../plugin";

export default class Ping extends Plugin {
    public async init(cl:Discord.Client) {
        super.init(cl);
        this.client.on("message",this.onMessage.bind(this));
        return Promise.resolve();
    }
    public async ready() {
        console.log("ping ready");
        return Promise.resolve();
    }
    private async onMessage(msg:Discord.Message) {
        if (msg.content === "!ping") {
            msg.reply("pong!");
        }
    }
}