import * as Discord from "discord.js";

export default abstract class Plugin {
    protected client:Discord.Client;
    public async init(cl:Discord.Client):Promise<void> {
        this.client = cl;
        return Promise.resolve();
    }
    public async ready():Promise<void> {
        console.log(`${this.constructor.name} ready.`);
        return Promise.resolve();
    }
    public async onMessage(msg:Discord.Message):Promise<void> {
        return Promise.resolve();
    }
    public abstract async onCommand(msg:Discord.Message, param:CmdParam):Promise<void>;
}
export interface CmdParam {
    say:string,
    dest:string[],
    cmd:string,
    etc:string[],
}