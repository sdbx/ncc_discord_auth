import * as fs from "fs-extra";
import { promisify } from "util";

export default class Config {
    public static readonly appVersion:number = 1;
    public version:number = Config.appVersion;
    public discordID:DiscordID = new DiscordID();
    private readonly saveTo:string = "./config/config.json";
    private readonly dirpath:string = this.saveTo.substring(0,this.saveTo.lastIndexOf("/"));
    public constructor() {
        console.log("Hi");
    }
    public async export():Promise<boolean> {
        if (await this.checkDir()) {
            const write:string = JSON.stringify(this,(key:string,value:any) => {
                if (key === "saveTo" || key === "dirpath") {
                    value = "____";
                }
                if (key === "version"){
                    value = Config.appVersion;
                }
                return value;
            },"\t");
            const result = await fs.access(this.saveTo,fs.constants.W_OK)
                .catch((err:any) => {
                    if (err.code === "ENOENT") {
                        return;
                    } else {
                        throw err;
                    }
                })
                .then(() => fs.writeFile(this.saveTo,write,{encoding:"utf-8"}))
                .then(() => true)
                .catch((err) => {console.log(err); return false;});
            return Promise.resolve(result);
        } else {
            console.error("export - No directory");
            // return Promise.reject("No directory");
            return Promise.resolve(false);
        }
    }
    public async import(createIfNeed:boolean = false):Promise<void> {
        const accessible:boolean = await fs.stat(this.saveTo)
                        .then((stat:fs.Stats) => true)
                        .catch((err:any) => false);
        if (accessible) {
            const text:string = await fs.readFile(this.saveTo,{encoding:"utf-8"});
            const data:any = JSON.parse(text);
            data.saveTo = null;
            data.dirpath = null;
            this.clone(data,this);
            // console.log(JSON.stringify(this));
            return Promise.resolve();
        } else {
            console.error("Can't read config file");
            if (createIfNeed) {
                const result:boolean = await this.export();
                if (!result) {
                    return Promise.reject("Can't access directory");
                }
            }
            return Promise.resolve();
        }
    }
    private async checkDir():Promise<boolean> {
        return await fs.access(this.dirpath,fs.constants.R_OK | fs.constants.W_OK)
            .then(() => Promise.resolve(true))
            .catch((err) => fs.mkdir(this.dirpath))
            .then(() => Promise.resolve(true))
            .catch((err) => Promise.resolve(false));
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
export class DiscordID {
    public room:number = 0;
    public botChannel:number = 0;
    public welcomeChannel:number = 0; // discordMainChID
}
export class Message {
    public welcome:string = "Hello!";
    public authed:string = "Authed";
}
