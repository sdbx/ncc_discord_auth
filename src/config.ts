import * as fs from "fs-extra";
import * as path from "path";
import Log from "./log";

export default class Config {
    public static readonly appVersion:number = 2; // app version
    // tslint:disable-next-line
    private static readonly excludes:string = "appVersion,defaultblacklist,saveTo,blacklist,dirpath,configName,name,subDir,sub";
    public version:number; // config version
    /*
    public discordID:IDiscordID = {articleChannels:[]} as any;
    public cafe:ICafe = {} as any;
    public game:Game = new Game();
    public discordToken:string = "token";
    public roleName:string = "@everyone";
    public articleCfg:IArticleCfg = {} as any;
    */
    public blacklist:string[]; // blacklist for config
    // private readonly saveTo:string = "./config/config.json";
    protected configName:string;
    protected subDir:string; // subdir
    protected saveTo:string; // save location
    public static get dirpath():string {
        let rootDir = path.resolve(process.cwd());
        if (!rootDir.endsWith("ncc_discord_auth")) {
            rootDir = path.resolve(".");
            if (rootDir.endsWith("build")) {
                rootDir = path.resolve("..");
            }
        }
        return path.resolve(rootDir,"config");
    }
    /**
     * Create constructor
     * @param _name Name of config
     * @param _version Version
     */
    public constructor(_name:string,_sub = null, _version = Config.appVersion) {
        // this.dirpath = this.saveTo.substring(0,this.saveTo.lastIndexOf("/"));
        this.version = _version;
        this.blacklist = [];
        this.subDir = _sub;
        this.name = _name;
        // console.log(`${_name}'s config: ${this.saveTo}`);
    }
    public set sub(n:string) {
        this.subDir = n;
        this.name = this.name;
    }
    public set name(n:string) {
        this.configName = n;
        if (this.subDir != null) {
            this.saveTo = path.resolve(Config.dirpath, this.subDir, `${n}.json`);
        }else {
            this.saveTo = path.resolve(Config.dirpath, `${n}.json`);
        }
    }
    public get name():string {
        return this.configName;
    }
    /**
     * export config to file
     * @returns success? (reject,resolve)
     */
    public async export():Promise<void> {
        const ignore:string[] = this.blacklist.map(a => Object.assign({}, a));
        Config.excludes.split(",").forEach(v => ignore.push(v));
        const write:string = JSON.stringify(this,
            (key:string,value:any) => (ignore.indexOf(key) >= 0) ? undefined : value,"\t");
        try {
            await fs.ensureFile(this.saveTo);
            await fs.writeFile(this.saveTo,write,{encoding:"utf-8"});
            return Promise.resolve();
        } catch (err) {
            Log.e(err);
            return Promise.reject();
        }
    }
    public async has(_path = this.saveTo):Promise<boolean> {
        return fs.ensureFile(this.saveTo).then(() => true).catch(() => false);
    }
    /**
     * import config from file
     * @returns success? (reject,resolve)
     */
    public async import(write:boolean = false):Promise<void> {
        const exists = await this.has();
        let file_version = Number.MAX_SAFE_INTEGER;
        if (exists) {
            // load data
            const text:string = await fs.readFile(this.saveTo,{encoding:"utf-8"});
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                Log.w("Config","JSON parse error.")
                data = {};
            }
            file_version = data.version;
            // remove non-cloneable
            const ignore:string[] = this.blacklist.map(a => Object.assign({}, a));
            Config.excludes.split(",").forEach(v => ignore.push(v));
            ignore.push("version");
            for (const [key, value] of Object.entries(ignore)) {
                if (ignore.indexOf(key) >= 0) {
                    delete data[key];
                }
            }
            // clone!
            this._clone(data);
            // update if app version is higher or write
            if (file_version < this.version || write) {
                return this.export();
            } else {
                return Promise.resolve();
            }
        }
        console.error("Can't read config file");
        if (write) {
            return await this.export();
        } else {
            return Promise.reject();
        }
    }
    protected _clone(source:any) {
        for (const key of Object.keys(this)) {
            if (this.hasOwnProperty(key) && source.hasOwnProperty(key)) {
                this[key] = this.clone_chain(source[key],this[key]);
            }
        }
    }
    protected async checkDir():Promise<boolean> {
        return fs.access(Config.dirpath,fs.constants.R_OK | fs.constants.W_OK)
        .then(() => true)
        .catch((err) => fs.mkdir(Config.dirpath))
        .then(() => true)
        .catch((err) => Promise.resolve(false));
    }
    protected clone_chain<T>(source:any,dest:T):T {
        if (source == null || Array.isArray(dest) || !(dest instanceof Object) || dest == null) {
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