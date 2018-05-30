import * as fs from "fs-extra";
import * as path from "path";
import fetcher from "../fetcher";

export default class Config {
    public static readonly appVersion:number = 2; // app version
    private static readonly excludes:string = "appVersion,defaultWhitelist,saveTo,whitelist,dirpath";
    public version:number; // config version
    protected whitelist:string[]; // whitelist for config
    /*
    public discordID:IDiscordID = {articleChannels:[]} as any;
    public cafe:ICafe = {} as any;
    public game:Game = new Game();
    public discordToken:string = "token";
    public roleName:string = "@everyone";
    public articleCfg:IArticleCfg = {} as any;
    */

    // private readonly saveTo:string = "./config/config.json";
    protected readonly saveTo:string; // save location
    protected readonly dirpath:string;
    /**
     * Create constructor
     * @param _name Name of config
     * @param _version Version
     */
    public constructor(_name:string,_version:number = Config.appVersion) {
        this.dirpath = path.resolve(".");
        if (this.dirpath.endsWith("build")) {
            this.dirpath = path.resolve("..");
        }
        this.dirpath = path.resolve(this.dirpath,"config");
        this.saveTo = path.resolve(this.dirpath,`${_name}.json`);
        // this.dirpath = this.saveTo.substring(0,this.saveTo.lastIndexOf("/"));
        this.version = _version;
        this.whitelist = [];
        // console.log(`${_name}'s config: ${this.saveTo}`);
    }
    /**
     * export config to file
     * @returns success? (reject,resolve)
     */
    public async export():Promise<void> {
        if (await this.checkDir()) {
            // make whitelist
            const ignore:string[] = this.whitelist.map(a => Object.assign({}, a));
            Config.excludes.split(",").forEach(v => ignore.push(v));

            const write:string = JSON.stringify(this,(key:string,value:any) => (ignore.indexOf(key) >= 0) ? undefined : value,"\t");
            return await fs.access(this.saveTo,fs.constants.W_OK)
                .catch(err => {
                    if (err.code === "ENOENT") {
                        return null;
                    } else {
                        throw err;
                    }
                })
                .then(() => fs.writeFile(this.saveTo,write,{encoding:"utf-8"}))
                .then(() => Promise.resolve())
                .catch(err => Promise.reject(err));
        } else {
            console.error("export - No directory");
            return Promise.reject("No directory");
        }
    }
    /**
     * import config from file
     * @returns success? (reject,resolve)
     */
    public async import():Promise<void> {
        const error:any = await fs.access(this.saveTo,fs.constants.F_OK | fs.constants.W_OK)
                        .then(() => null)
                        .catch((err:any) => err);
        if (error == null) {
            // load data
            const text:string = await fs.readFile(this.saveTo,{encoding:"utf-8"});
            const data:any = JSON.parse(text);
            const file_version:number = data.version;
            // remove non-cloneable
            const ignore:string[] = this.whitelist.map(a => Object.assign({}, a));
            Config.excludes.split(",").forEach(v => ignore.push(v));
            ignore.push("version");
            for (const [key,value] of Object.entries(ignore)) {
                if (ignore.indexOf(key) >= 0) {
                    delete data[key];
                }
            }
            // clone!
            this.clone(data);
            // update if app version is higher
            if (file_version < this.version) {
                await this.export();
            }
            return Promise.resolve();
        } else {
            console.error("Can't read config file");
            return Promise.reject(error);
        }
    }
    protected clone(source:any) {
        for (const key of Object.keys(this)) {
            if (this.hasOwnProperty(key) && source.hasOwnProperty(key)) {
                this[key] = this.clone_chain(source[key],this[key]);
            }
        }
    }
    protected async checkDir():Promise<boolean> {
        return Promise.resolve(await fs.access(this.dirpath,fs.constants.R_OK | fs.constants.W_OK)
            .then(() => true)
            .catch((err) => fs.mkdir(this.dirpath))
            .then(() => true)
            .catch((err) => Promise.resolve(false)));
    }
    protected clone_chain<T>(source:any,dest:T):T {
        if (source == null || !(dest instanceof Object)) {
            // primitive type
            return source as T;
        }
        const out:T = dest.constructor();
        for (const key of Object.keys(out)) {
            if (out.hasOwnProperty(key) && source.hasOwnProperty(key)) {
                out[key] = this.clone_chain(source[key],out[key]);
            }
        }
        return out;
    }
}
/*
export interface IDiscordID {
    room:number;
    botChannel:number;
    welcomeChannel:number; // discordMainChID
    articleChannels:number[];
}
export interface IMessage {
    welcome:string;
    authed:string;
}
export interface ICafe {
    url:string;
    id:number;
    article:number;
}
export class Game {
    public static readonly Playing:string = "playing";
    public static readonly Watching:string = "watching";
    public static readonly Listening:string = "listening";
    public static readonly Streaming:string = "streaming";
    public name:string;
    public type:string;
    constructor(input:{name:string,type:string}= {name:"Bots",type:"Playing"}) {
        this.name = input.name;
        this.type = input.type;
    }
    public getID(type:string):number {
        const order:string[] = [Game.Playing,Game.Watching,Game.Listening,Game.Streaming];
        let out:number = 0;
        for (let i = 0;i < order.length;i += 1) {
            if (order[i].toLowerCase() === type.toLowerCase()) {
                out = i;
                break;
            }
        }
        return out;
    }
}
export interface IArticleCfg {
    enableAlert:boolean;
    updateSec:number;
}
*/