import * as fs from "fs-extra";
import fetcher from "../fetcher";

export default class Config {
    public static readonly appVersion:number = 2; // app version
    private static readonly defaultWhitelist:string = "appVersion,defaultWhitelist,saveTo,_whitelist,whitelist,dirpath";
    public version:number; // config version
    protected saveTo:string; // save location
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
    private readonly dirpath:string = this.saveTo.substring(0,this.saveTo.lastIndexOf("/"));
    /**
     * Create constructor
     * @param _name Name of config
     * @param _version Version
     */
    public constructor(_name:string,_version:number = Config.appVersion) {
        this.saveTo = `./config/${_name}.json`;
        this.version = _version;
        this.whitelist = [];
    }
    /**
     * export config to file
     * @returns success? (reject,resolve)
     */
    public async export():Promise<void> {
        if (await this.checkDir()) {
            // make whitelist
            const ignore:string[] = this.whitelist.map(a => Object.assign({}, a));
            Config.defaultWhitelist.split(",").forEach(v => ignore.push(v));

            const write:string = JSON.stringify(this,(key:string,value:any) => (ignore.indexOf(key) >= 0) ? undefined : value,"\t");
            return await fs.access(this.saveTo,fs.constants.W_OK)
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
        const error:any = await fs.stat(this.saveTo)
                        .then((stat:fs.Stats) => null)
                        .catch((err:any) => err);
        if (error == null) {
            // load data
            const text:string = await fs.readFile(this.saveTo,{encoding:"utf-8"});
            const data:any = JSON.parse(text);
            const file_version:number = data.version;
            // remove non-cloneable
            const ignore:string[] = this.whitelist.map(a => Object.assign({}, a));
            Config.defaultWhitelist.split(",").forEach(v => ignore.push(v));
            ignore.push("version");
            for (const [key,value] of Object.entries(ignore)) {
                if (ignore.indexOf(key) >= 0) {
                    delete data[key];
                }
            }
            // clone!
            this.clone(data,this);
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
    private async checkDir():Promise<boolean> {
        return Promise.resolve(await fs.access(this.dirpath,fs.constants.R_OK | fs.constants.W_OK)
            .then(() => true)
            .catch((err) => fs.mkdir(this.dirpath))
            .then(() => true)
            .catch((err) => Promise.resolve(false)));
    }
    private clone(obj:any,toObject:any = null):any {
        if (obj === null || typeof(obj) !== "object") {
            return obj;
        }
        let copy:any;
        if (toObject == null) {
            copy = obj.constructor();
        } else {
            copy = toObject;
        }
        // const copy:any = obj.constructor();
        for (const attr in obj) {
          if (obj.hasOwnProperty(attr)) {
              const value:any = this.clone(obj[attr],toObject[attr]);
              if (value != null) {
                  try {
                    copy[attr] = value;
                  } catch (err) {
                      console.log(err);
                  }
              }
          }
        }
        return copy;
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