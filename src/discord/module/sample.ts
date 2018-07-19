import * as Discord from "discord.js";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { MainCfg } from "../runtime";
import { ChainData, CommandHelp, CommandStatus, DiscordFormat, Keyword, ParamType } from "../runutil";

export default class Sample extends Plugin {
    // declare config file: use save data
    protected config:Config = new Config("sample");
    // declare command.
    private sample:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.sample = new CommandHelp("안녕", this.lang.sample.hello);
        // get parameter as complex
        this.sample.complex = true;
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        // test command if match
        const testSample = this.sample.test(command,options);
        if (testSample.match) {
            // send Message
            await msg.reply(this.lang.sample.hello);
        }
        return Promise.resolve();
    }
}