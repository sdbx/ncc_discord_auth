import * as Discord from "discord.js";
import Config from "../config";
import Ping from "./module/ping";
import Plugin from "./plugin";
export default class Runtime {
    private cfg = new Bot();
    private client:Discord.Client;
    private plugins:Plugin[] = [];
    constructor() {
        this.plugins.push(new Ping());
    }
    public async start() {
        // load config
        await this.cfg.import(true).catch((err) => null);
        // init client
        this.client = new Discord.Client();
        // init plugins
        await this.plugins.forEach(async (value) => {
            await value.init(this.client)
            this.client.on("ready",value.ready.bind(value));
        });
        this.client.on("message",this.onMessage.bind(this));
        // client login (ignore)
        this.client.login(this.cfg.token);
    }
    protected async onMessage(msg:Discord.Message) {
        if (this.cfg.prefix.test(msg.content)) {
            await msg.channel.sendMessage("프레타다냥");
        }
    }
}
class Bot extends Config {
    public token = "Bot token";
    protected prefixRegex = (/^(네코\s*메이드\s+|)(프레|레타|프레타|프렛땨|네코)(야|[짱|쨩](아|)|님)/).source;
    constructor() {
        super("bot");
        this.blacklist.push("prefix","prefixRegex");
    }
    public get prefix():RegExp {
        return new RegExp(this.prefixRegex,"g");
    }
    public set prefix(value:RegExp) {
        this.prefixRegex = value.toString();
    }
}