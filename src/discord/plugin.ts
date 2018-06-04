import * as Discord from "discord.js";

export default abstract class Plugin {
    protected client:Discord.Client;
    public async init(cl:Discord.Client):Promise<void> {
        this.client = cl;
    }
    public async ready():Promise<void> {
        console.log(`${this.constructor.name} ready.`);
    }
}