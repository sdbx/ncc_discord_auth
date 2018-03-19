import * as fs from "fs";
import { promisify } from "util";

const readfile = promisify(fs.readFile);
const writefile = promisify(fs.writeFile);
const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);
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
                    value = "Constant";
                }
                return value;
            },"\t");
            const result = await access(this.saveTo,fs.constants.W_OK)
                .then(() => writefile(this.saveTo,write,{encoding:"utf-8"}))
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
        const accessible = await access(this.saveTo,fs.constants.R_OK)
                                .then(() => true)
                                .catch(() => false);
        if (accessible) {
            const text:string = await readfile(this.saveTo,{encoding:"utf-8"});
            const data:any = JSON.parse(text);
            data.saveTo = null;
            data.dirpath = null;
            this.clone(data,this);
            // console.log(JSON.stringify(this));
            return Promise.resolve();
        } else {
            console.error("Can't read config file");
            if (createIfNeed) {
                await this.export();
            }
            return Promise.resolve();
        }
    }
    private async checkDir():Promise<boolean> {
        return await access(this.dirpath,fs.constants.R_OK | fs.constants.W_OK)
            .then(() => Promise.resolve(true))
            .catch((err) => mkdir(this.dirpath,0o777))
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
