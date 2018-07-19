import * as Discord from "discord.js";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { MainCfg } from "../runtime";
import { ChainData, CommandHelp, CommandStatus, Keyword, ParamType } from "../runutil";

export default class Auth extends Plugin {
    protected config:Config = new AuthConfig();
    // declare command.
    private authNaver:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.authNaver = new CommandHelp("인증", "__");
        // get parameter as complex
        this.authNaver.complex = true;
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        // test command if match
        const testSample = this.authNaver.test(command,options);
        if (testSample.match) {
            // send Message
            await msg.reply(this.lang.sample.hello);
        }
        return Promise.resolve();
    }
}
interface AuthInfo {
    message:Discord.MessageEmbed,
    userid:string, // discord id
    useID:boolean, // use id?
    useFixedName:boolean, // use fixed name?
    name:string,
    timestamp:number,
    token:number,
}
class AuthConfig extends Config {
    public timeout = 600;
    public commentURL = "https://cafe.naver.com/sdbx/7433"
    constructor() {
        super("auth");
    }
}