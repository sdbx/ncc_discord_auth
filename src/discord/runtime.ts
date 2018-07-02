import * as Discord from "discord.js";
import Config from "../config";
import Plugin, { CmdParam } from "./plugin";

import Auth from "./module/auth";
import Ping from "./module/ping";

const expDest = /[\w가-힣 ]+?(을|를|좀)/i;
const expCmd = /[\w가-힣]+(줘|해)/i;
const expCmdSuffix = /(해|줘|해줘)/i;
const expCmdFilter = /[가-힣\w]+/i;
export default class Runtime {
    private cfg = new Bot();
    private client:Discord.Client;
    private plugins:Plugin[] = [];
    constructor() {
        this.plugins.push(new Ping(),new Auth());
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
        let chain = msg.content;
        const prefix = this.cfg.prefix;
        const params:CmdParam = {} as CmdParam;
        if (prefix.test(chain)) {
            params.say = chain.match(prefix)[0];
            chain = chain.replace(prefix,"");
            // test destination
            if (expDest.test(chain)) {
                params.dest = chain.match(expDest)[0].split(" ").filter(this.filterEmpty);
                chain = chain.replace(expDest,"");
            }
            // test command
            if (expCmd.test(chain)) {
                params.cmd = chain.match(expCmd)[0];
                chain = chain.replace(expCmd, "");
            } else {
                params.cmd = chain.substr(chain.lastIndexOf(" ")).trim();
                chain = chain.substring(0,chain.lastIndexOf(" ") + 1);
            }
            // cmd replace
            const cmdSf = params.cmd.match(expCmdSuffix);
            if (cmdSf != null) {
                params.cmd = params.cmd.substring(0,params.cmd.lastIndexOf(cmdSf[cmdSf.length - 1]));
            }
            const cmdSimple = params.cmd.match(expCmdFilter);
            if (cmdSimple != null) {
                params.cmd = cmdSimple[0];
            }
            // etc..
            params.etc = chain.split(" ").filter(this.filterEmpty);
            // dispatch command
            await Promise.all(this.plugins.map((value) => value.onCommand.bind(value)(msg,params)));
        } else {
            await Promise.all(this.plugins.map((value) => value.onMessage.bind(value)(msg)));
        }
    }
    private filterEmpty(value:string):boolean {
        return value.length >= 1;
    }
}
class Bot extends Config {
    public token = "Bot token";
    protected prefixRegex = (/^(네코\s*메이드\s+)?(프레|레타|프레타|프렛땨|네코|시로)(야|[짱쨩]아?|님)/).source;
    constructor() {
        super("bot");
        this.blacklist.push("prefix");
    }
    public get prefix():RegExp {
        return new RegExp(this.prefixRegex,"i");
    }
    public set prefix(value:RegExp) {
        this.prefixRegex = value.toString();
    }
}