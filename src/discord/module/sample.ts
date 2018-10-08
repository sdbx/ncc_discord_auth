import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamAccept, ParamType } from "../rundefine"
import { cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake } from "../runutil"


export default class Sample extends Plugin {
    // declare config file: use save data
    protected config = new Config("sample")
    // declare command.
    private sample:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.sample = new CommandHelp("안녕", this.lang.sample.hello)
        // get parameter as complex
        this.sample.complex = true
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testSample = this.sample.check(this.global, command, state)
        if (testSample.match) {
            // send Message
            await msg.reply(this.lang.sample.hello)
        }
        return Promise.resolve()
    }
}